import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { WordPressService } from './wordpress.service';
import { AIModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [AIModule, BillingModule],
  controllers: [ChannelsController],
  providers: [ChannelsService, WordPressService],
  exports: [ChannelsService, WordPressService],
})
export class ChannelsModule {}
