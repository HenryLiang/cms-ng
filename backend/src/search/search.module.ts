import { Module } from '@nestjs/common';
import { SearchService } from './search.service';

/**
 * Elasticsearch 全文检索模块(PRD §7.1)。
 * PrismaModule 为 @Global,无需显式 import;EventEmitterModule 亦 @Global,
 * SearchService 的 @OnEvent 订阅即生效。MediaModule 显式 import 以获得
 * SearchService(检索降级判定)。
 */
@Module({
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
