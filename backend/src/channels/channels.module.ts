import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [AIModule],
  controllers: [ChannelsController],
  providers: [ChannelsService],
})
export class ChannelsModule {}
