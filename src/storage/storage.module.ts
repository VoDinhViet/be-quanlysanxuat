import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { StorageDriver } from '../config/upload-config.type';
import uploadConfig from '../config/upload.config';
import { AllConfigType } from '../config/config.type';
import { LocalDiskStorageProvider } from './providers/local-disk.storage-provider';
import { STORAGE_PROVIDER } from './storage.constants';
import type { StorageProvider } from './storage-provider.interface';

@Global()
@Module({
  imports: [ConfigModule.forFeature(uploadConfig)],
  providers: [
    LocalDiskStorageProvider,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService, LocalDiskStorageProvider],
      useFactory: (
        configService: ConfigService<AllConfigType>,
        localDiskProvider: LocalDiskStorageProvider,
      ): StorageProvider => {
        const driver = configService.getOrThrow('upload.driver', {
          infer: true,
        });

        switch (driver) {
          case StorageDriver.LOCAL:
          default:
            return localDiskProvider;
        }
      },
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
