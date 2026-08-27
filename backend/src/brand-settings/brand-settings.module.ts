import { Global, Module } from '@nestjs/common';
import { BrandSettingsController } from './brand-settings.controller';
import { BrandSettingsService } from './brand-settings.service';

@Global()
@Module({
  controllers: [BrandSettingsController],
  providers: [BrandSettingsService],
  exports: [BrandSettingsService],
})
export class BrandSettingsModule {}
