import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AllConfigType } from '../../config/config.type';
import { AuthModule } from '../auth/auth.module';
import { setFileUrlResolver } from './file-url-resolver';
import { FilesCleanupService } from './files-cleanup.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { buildSignedFileUrl } from './util/file-url.util';

@Module({
  imports: [AuthModule],
  controllers: [FilesController],
  providers: [FilesService, FilesCleanupService],
  exports: [FilesService],
})
export class FilesModule implements OnModuleInit {
  constructor(private readonly configService: ConfigService<AllConfigType>) {}

  /** Gắn resolver URL cho `FileResDto` (map bởi class-transformer, ngoài DI — xem
   * `file-url-resolver.ts`). Hạn `url` ký tính từ lúc map, không phải lúc client dùng link. */
  onModuleInit(): void {
    const secret = this.configService.getOrThrow('upload.urlSecret', {
      infer: true,
    });
    const ttl = this.configService.getOrThrow('upload.urlTtl', { infer: true });

    setFileUrlResolver((fileId) => buildSignedFileUrl(fileId, secret, ttl));
  }
}
