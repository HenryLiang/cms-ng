import { Global, Module } from '@nestjs/common';
import { CosStorageService } from './cos-storage.service';
import { STORAGE_SERVICE } from './storage.service';

@Global()
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
