import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVideoJobDto {
  @ApiPropertyOptional({
    description:
      '任务模式:TEXT_TO_CLIP(L1 文生片段)| ARTICLE_TO_VIDEO(L2 稿件成片)',
    enum: ['TEXT_TO_CLIP', 'ARTICLE_TO_VIDEO'],
    default: 'TEXT_TO_CLIP',
  })
  @IsOptional()
  @IsIn(['TEXT_TO_CLIP', 'ARTICLE_TO_VIDEO'])
  mode?: 'TEXT_TO_CLIP' | 'ARTICLE_TO_VIDEO';

  @ApiPropertyOptional({
    description:
      '画面描述(L1 必填;L2 可选,作为成片风格附加指引)。与 articleId 的交叉必填校验在 service 层',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prompt?: string;

  @ApiPropertyOptional({ description: '来源文章 ID(L2 必填,仅溯源引用)' })
  @IsOptional()
  @IsString()
  articleId?: string;

  @ApiPropertyOptional({
    description: '生成 provider,缺省用服务端 VIDEO_CLIP_PROVIDER 配置',
    enum: ['volcengine', 'minimax'],
  })
  @IsOptional()
  @IsIn(['volcengine', 'minimax'])
  provider?: string;

  @ApiPropertyOptional({
    description: '时长(秒),provider 支持 6/10',
    default: 6,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(15)
  durationSec?: number;

  @ApiPropertyOptional({ enum: ['768P', '1080P'], default: '768P' })
  @IsOptional()
  @IsIn(['768P', '1080P'])
  resolution?: '768P' | '1080P';

  @ApiPropertyOptional({ enum: ['16:9', '9:16', '1:1'], default: '9:16' })
  @IsOptional()
  @IsIn(['16:9', '9:16', '1:1'])
  aspectRatio?: '16:9' | '9:16' | '1:1';
}

export class QueryVideoJobDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @ApiPropertyOptional({ description: '按状态筛选(VideoJobStatus)' })
  @IsOptional()
  @IsString()
  status?: string;
}
