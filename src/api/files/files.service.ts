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
  private static readonly IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  // Legacy binary Office formats (application/msword, application/vnd.ms-excel) are deliberately
  // excluded — `file-type` has no magic-byte signature for the old OLE2/CFB container, so a
  // genuine .doc/.xls would be indistinguishable from a spoofed one. Modern Office defaults to
  // the OOXML formats below, which are detectable.
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

  async upload(file: Express.Multer.File | undefined, options: UploadOptions): Promise<FileResDto> {
    if (!file) {
      throw new AppException(ErrorCode.E016, HttpStatus.BAD_REQUEST);
    }

    // `kind` comes from the policy, never from the client — otherwise a caller could ask for
    // USER_AVATAR while claiming DOCUMENT and slip a PDF past the image allowlist.
    const { kind } = UPLOAD_POLICIES[options.type];
    const allowedMimeTypes =
      kind === FileKind.IMAGE ? FilesService.IMAGE_MIME_TYPES : FilesService.DOCUMENT_MIME_TYPES;
    const maxSize =
      kind === FileKind.IMAGE
        ? this.configService.getOrThrow('upload.maxImageSize', { infer: true })
        : this.configService.getOrThrow('upload.maxDocumentSize', { infer: true });

    if (file.size > maxSize) {
      throw new AppException(ErrorCode.E017, HttpStatus.PAYLOAD_TOO_LARGE);
    }

    // Trust the file's actual bytes, not the client-declared mimetype (trivially spoofable by
    // renaming a file) — this is the whole point of validating here instead of via Multer's
    // `fileFilter`, which only sees the declared mimetype.
    const detected = await detectFileType(file.buffer);
    if (!detected || !allowedMimeTypes.includes(detected.mime)) {
      throw new AppException(ErrorCode.E016, HttpStatus.BAD_REQUEST);
    }

    const storageKey = this.buildStorageKey(detected.ext);
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const storageDriver = this.configService.getOrThrow('upload.driver', { infer: true });

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

  /**
   * Streams the bytes behind an already-signature-verified request (`FileSignatureGuard`).
   * Streams rather than buffering: a 10MB document times N concurrent downloads would otherwise
   * sit in memory all at once.
   */
  async streamFile(
    fileId: string,
    reqDto: DownloadFileReqDto,
    res: Response,
  ): Promise<StreamableFile> {
    const file = await this.ensureFileExists(fileId);

    res.set({
      'Content-Type': file.mimetype,
      'Content-Length': String(file.size),
      'Content-Disposition': this.buildContentDisposition(file.kind, file.originalName),
      // Bounded by the signature's own lifetime — caching past `exp` would just cache a URL that
      // no longer works. `private` because the URL is a capability, not public content.
      'Cache-Control': `private, max-age=${secondsUntil(reqDto.exp)}`,
    });

    return new StreamableFile(this.storageProvider.createReadStream(file.storageKey));
  }

  /**
   * Only the uploader or a `system:manage` holder may delete. Without this any authenticated user
   * could wipe every file in the registry — bytes included, with no way back.
   */
  async deleteFile(fileId: string, actorCredentialId: string): Promise<void> {
    const file = await this.ensureFileExists(fileId);

    if (file.uploadedBy !== actorCredentialId) {
      const granted = await this.permissionsService.getPermissionCodes(actorCredentialId);

      if (!granted.includes(SUPER_PERMISSION)) {
        throw new AppException(ErrorCode.E033, HttpStatus.FORBIDDEN);
      }
    }

    await this.storageProvider.delete(file.storageKey);
    await this.db.delete(files).where(eq(files.id, fileId));
  }

  /**
   * Called by consumer services (users/materials/products) before writing a `*FileId` link: checks
   * every id exists (`E042`) and stamps `linkedAt`, which takes the file out of reach of
   * `FilesCleanupService`.
   *
   * **Call this before the write, never after — including before opening a transaction.** If a
   * later write fails, a file marked linked with nothing pointing at it becomes permanent garbage:
   * wasteful, but harmless. Reverse the order and a crash between the entity write and this call
   * leaves a live row referencing an unlinked file, which the sweeper deletes a day later — a
   * broken image on real data. Failing towards keeping garbage is the whole point of this ordering.
   */
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

    // `isNull` keeps `linkedAt` meaning "first time it was used" — re-linking must not move it.
    await this.db
      .update(files)
      .set({ linkedAt: new Date() })
      .where(and(inArray(files.id, uniqueIds), isNull(files.linkedAt)));
  }

  private async ensureFileExists(fileId: string) {
    const file = await this.db.query.files.findFirst({ where: eq(files.id, fileId) });

    if (!file) {
      throw new AppException(ErrorCode.E042, HttpStatus.NOT_FOUND);
    }

    return file;
  }

  /**
   * Images render inline so `<img src>` works; documents download. The filename is emitted twice on
   * purpose: `filename=` as an ASCII-stripped fallback for old clients, and RFC 5987 `filename*=`
   * carrying the real value — original names here are Vietnamese, and a plain `filename=` would
   * mangle every diacritic.
   */
  private buildContentDisposition(kind: FileKind, originalName: string): string {
    const disposition = kind === FileKind.IMAGE ? 'inline' : 'attachment';
    const asciiFallback = originalName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');

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
