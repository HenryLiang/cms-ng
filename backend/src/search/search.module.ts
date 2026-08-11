import { Module } from '@nestjs/common';
import { SearchService } from './search.service';

/**
 * Elasticsearch 全文检索模块（媒体库 + 稿件）。
 * PrismaModule 为 @Global,无需显式 import;EventEmitterModule 亦 @Global,
 * SearchService 的 @OnEvent 订阅即生效。媒体与稿件模块显式 import 以获得
 * SearchService（检索与降级判定）。
 */
@Module({
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
