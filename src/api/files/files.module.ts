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

  /**
   * Binds the module-level URL resolver used by `FileResDto` (which is mapped by class-transformer,
   * outside DI — see `file-url-resolver.ts`). Every `FileResDto` produced after boot renders `url`
   * as a link signed with the configured secret and expiring `upload.urlTtl` seconds from *mapping*
   * time, so the clock starts when the client is handed the URL.
   */
  onModuleInit(): void {
    const secret = this.configService.getOrThrow('upload.urlSecret', { infer: true });
    const ttl = this.configService.getOrThrow('upload.urlTtl', { infer: true });

    setFileUrlResolver((fileId) => buildSignedFileUrl(fileId, secret, ttl));
  }
}
