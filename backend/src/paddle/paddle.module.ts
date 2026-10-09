import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaddleService } from './paddle.service';
import { PaddleSyncService } from './paddle-sync.service';
import { PaddleWebhookController } from './paddle-webhook.controller';
import { PaddlePortalController } from './paddle-portal.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PaddleWebhookController, PaddlePortalController],
  providers: [PaddleService, PaddleSyncService],
  exports: [PaddleService],
})
export class PaddleModule {}
