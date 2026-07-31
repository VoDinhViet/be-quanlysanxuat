import { HttpStatus, Inject, Injectable, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { createHash, randomUUID } from 'crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Response } from 'express';

import { AllConfigType } from '../../config/config.type';
import { ErrorCode } from '../../constants/error-code.constant';
import { SUPER_PERMISSION } from '../../constants/permission.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { files, FileKind, UploadType } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { STORAGE_PROVIDER } from '../../storage/storage.constants';
import type { StorageProvider } from '../../storage/storage-provider.interface';
import { PermissionsService } from '../auth/permissions.service';
import { DownloadFileReqDto } from './dto/download-file.req.dto';
import { FileResDto } from './dto/file.res.dto';
import { UPLOAD_POLICIES } from './upload-policy';
import { secondsUntil } from './util/file-url.util';
import { detectFileType } from './util/file-type.util';

type UploadOptions = {
  type: UploadType;
  uploadedBy?: string;
};

@Injectable()
export class FilesService {
  private static readonly IMAGE_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ];

  // Cố ý loại định dạng Office nhị phân cũ (application/msword, application/vnd.ms-excel) —
  // `file-type` không có magic-byte signature cho container OLE2/CFB cũ, nên .doc/.xls thật không
  // phân biệt được với file giả mạo đổi tên. Office hiện đại mặc định dùng OOXML bên dưới, phát
  // hiện được.
  private static readonly DOCUMENT_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly permissionsService: PermissionsService,
  ) {}

  /** `type` (`UploadOptions`) đến từ query param của controller, không phải multipart field — vì
   * guard chạy trước `FileInterceptor` parse body, dọn đường cho check quyền theo từng loại sau
   * này mà FE không phải đổi gì. */
  async upload(
    file: Express.Multer.File | undefined,
    options: UploadOptions,
  ): Promise<FileResDto> {
    if (!file) {
      throw new AppException(ErrorCode.E016, HttpStatus.BAD_REQUEST);
    }

    // `kind` đến từ policy, không bao giờ từ client — nếu không, caller có thể xin USER_AVATAR
    // nhưng khai DOCUMENT để lách allowlist ảnh bằng một PDF.
    const { kind } = UPLOAD_POLICIES[options.type];
    const allowedMimeTypes =
      kind === FileKind.IMAGE
        ? FilesService.IMAGE_MIME_TYPES
        : FilesService.DOCUMENT_MIME_TYPES;
    const maxSize =
      kind === FileKind.IMAGE
        ? this.configService.getOrThrow('upload.maxImageSize', { infer: true })
        : this.configService.getOrThrow('upload.maxDocumentSize', {
            infer: true,
          });

    if (file.size > maxSize) {
      throw new AppException(ErrorCode.E017, HttpStatus.PAYLOAD_TOO_LARGE);
    }

    // Tin vào byte thật của file, không tin mimetype client khai (giả mạo được bằng cách đổi tên)
    // — đây là lý do validate ở đây thay vì qua `fileFilter` của Multer, thứ chỉ thấy mimetype khai.
    const detected = await detectFileType(file.buffer);
    if (!detected || !allowedMimeTypes.includes(detected.mime)) {
      throw new AppException(ErrorCode.E016, HttpStatus.BAD_REQUEST);
    }

    const storageKey = this.buildStorageKey(detected.ext);
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const storageDriver = this.configService.getOrThrow('upload.driver', {
      infer: true,
    });

    await this.storageProvider.save(storageKey, file.buffer, detected.mime);

    const [row] = await this.db
      .insert(files)
      .values({
        storageKey,
        originalName: file.originalname,
        mimetype: detected.mime,
        size: file.size,
        checksum,
        type: options.type,
        kind,
        storageDriver,
        uploadedBy: options.uploadedBy,
      })
      .returning();

    return this.toResDto(row);
  }

  async getFileById(fileId: string): Promise<FileResDto> {
    const file = await this.ensureFileExists(fileId);
    return this.toResDto(file);
  }

  /** Stream thay vì buffer toàn bộ: một tài liệu 10MB nhân N lượt tải đồng thời sẽ nằm hết trong
   * RAM cùng lúc nếu buffer. Request đã qua `FileSignatureGuard` xác minh chữ ký. */
  async streamFile(
    fileId: string,
    reqDto: DownloadFileReqDto,
    res: Response,
  ): Promise<StreamableFile> {
    const file = await this.ensureFileExists(fileId);

    res.set({
      'Content-Type': file.mimetype,
      'Content-Length': String(file.size),
      'Content-Disposition': this.buildContentDisposition(
        file.kind,
        file.originalName,
      ),
      // Giới hạn theo đúng vòng đời chữ ký — cache quá `exp` chỉ cache một URL đã hết hạn.
      // `private` vì URL là một capability, không phải nội dung công khai.
      'Cache-Control': `private, max-age=${secondsUntil(reqDto.exp)}`,
    });

    return new StreamableFile(
      this.storageProvider.createReadStream(file.storageKey),
    );
  }

  /** Chỉ người tải lên hoặc người có `system:manage` được xoá — nếu không, bất kỳ user đăng nhập
   * nào cũng xoá được mọi file trong registry, không có đường lùi. */
  async deleteFile(fileId: string, actorCredentialId: string): Promise<void> {
    const file = await this.ensureFileExists(fileId);

    if (file.uploadedBy !== actorCredentialId) {
      const granted =
        await this.permissionsService.getPermissionCodes(actorCredentialId);

      if (!granted.includes(SUPER_PERMISSION)) {
        throw new AppException(ErrorCode.E033, HttpStatus.FORBIDDEN);
      }
    }

    await this.storageProvider.delete(file.storageKey);
    await this.db.delete(files).where(eq(files.id, fileId));
  }

  /** Không check uploader/`system:manage` — dành cho service tiêu thụ (vd `BomsService`) thay một
   * link `*FileId` mà quyền route của chính nó đã cho phép. `deleteFile` mới là route
   * `DELETE /files/:id` trực tiếp, nơi caller tự quyết định xoá nên bắt buộc phải check. */
  async deleteFileById(fileId: string): Promise<void> {
    const file = await this.ensureFileExists(fileId);

    await this.storageProvider.delete(file.storageKey);
    await this.db.delete(files).where(eq(files.id, fileId));
  }

  /** Gọi bởi service tiêu thụ (users/materials/products...) trước khi ghi một `*FileId` — kiểm tồn
   * tại (`E042`) và đánh dấu `linkedAt` để `FilesCleanupService` bỏ qua. Bắt buộc gọi trước write,
   * kể cả trước khi mở transaction — đảo thứ tự có thể để lại row sống trỏ file chưa link, bị
   * sweeper xoá sau (ảnh vỡ trên dữ liệu thật). */
  async linkFiles(fileIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(fileIds)];
    if (uniqueIds.length === 0) {
      return;
    }

    const found = await this.db.query.files.findMany({
      columns: { id: true },
      where: inArray(files.id, uniqueIds),
    });

    if (found.length !== uniqueIds.length) {
      throw new AppException(ErrorCode.E042, HttpStatus.NOT_FOUND);
    }

    // `isNull` giữ đúng nghĩa `linkedAt` = "lần đầu được dùng" — link lại không được dịch nó.
    await this.db
      .update(files)
      .set({ linkedAt: new Date() })
      .where(and(inArray(files.id, uniqueIds), isNull(files.linkedAt)));
  }

  private async ensureFileExists(fileId: string) {
    const file = await this.db.query.files.findFirst({
      where: eq(files.id, fileId),
    });

    if (!file) {
      throw new AppException(ErrorCode.E042, HttpStatus.NOT_FOUND);
    }

    return file;
  }

  /** Ảnh `inline` để `<img src>` dùng được; tài liệu `attachment` để tải xuống. Tên file phát hai
   * lần cố ý: `filename=` là fallback ASCII cho client cũ, RFC 5987 `filename*=` mang giá trị thật
   * — tên gốc ở đây là tiếng Việt, `filename=` thường sẽ làm hỏng mọi dấu. */
  private buildContentDisposition(
    kind: FileKind,
    originalName: string,
  ): string {
    const disposition = kind === FileKind.IMAGE ? 'inline' : 'attachment';
    const asciiFallback = originalName
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/["\\]/g, '_');

    return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(originalName)}`;
  }

  private buildStorageKey(ext: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `${year}/${month}/${day}/${randomUUID()}.${ext}`;
  }

  private toResDto(file: typeof files.$inferSelect): FileResDto {
    return plainToInstance(FileResDto, file, { excludeExtraneousValues: true });
  }
}
