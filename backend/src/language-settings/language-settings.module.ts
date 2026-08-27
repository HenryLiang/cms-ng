import { Global, Module } from '@nestjs/common';
import { LanguageSettingsController } from './language-settings.controller';
import { LanguageSettingsService } from './language-settings.service';

@Global()
@Module({
  controllers: [LanguageSettingsController],
  providers: [LanguageSettingsService],
  exports: [LanguageSettingsService],
})
export class LanguageSettingsModule {}
