import { Module } from '@nestjs/common';
import { CosStorageService } from './cos-storage.service';
import { STORAGE_SERVICE, StorageService } from './storage.service';

@Module({
  providers: [
    CosStorageService,
    {
      provide: STORAGE_SERVICE,
      useExisting: CosStorageService,
    },
  ],
  exports: [STORAGE_SERVICE, CosStorageService],
})
export class StorageModule {}
