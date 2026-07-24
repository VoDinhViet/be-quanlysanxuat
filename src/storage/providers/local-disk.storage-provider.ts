import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { mkdir, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type { Readable } from 'stream';

import { AllConfigType } from '../../config/config.type';
import { StorageProvider } from '../storage-provider.interface';

/** Stores bytes on the local filesystem under `upload.dir`, streamed back by `GET /files/:id/download`. */
@Injectable()
export class LocalDiskStorageProvider implements StorageProvider {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  async save(key: string, buffer: Buffer): Promise<void> {
    const destination = join(this.getUploadDir(), key);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
  }

  createReadStream(key: string): Readable {
    return createReadStream(join(this.getUploadDir(), key));
  }

  async delete(key: string): Promise<void> {
    const destination = join(this.getUploadDir(), key);
    await rm(destination, { force: true });
  }

  private getUploadDir(): string {
    return this.configService.getOrThrow('upload.dir', { infer: true });
  }
}
