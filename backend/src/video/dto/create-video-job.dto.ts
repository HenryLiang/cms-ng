import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
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
    description:
      '时长(秒),Seedance 2.x 支持 4~15 自由档;1.0 系归一 5/10,MiniMax 归一 6/10',
    default: 6,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(15)
  durationSec?: number;

  @ApiPropertyOptional({
    enum: ['480P', '768P', '1080P'],
    default: '768P',
    description:
      '480P/720P 为 Seedance 2.x 档(2.0-mini 仅这两档,1080P 降级 720p);MiniMax 无 480P 档映射 768P',
  })
  @IsOptional()
  @IsIn(['480P', '768P', '1080P'])
  resolution?: '480P' | '768P' | '1080P';

  @ApiPropertyOptional({ enum: ['16:9', '9:16', '1:1'], default: '9:16' })
  @IsOptional()
  @IsIn(['16:9', '9:16', '1:1'])
  aspectRatio?: '16:9' | '9:16' | '1:1';

  @ApiPropertyOptional({
    description:
      '原生音频(仅 L1;Seedance 1.5+/2.x 支持,生成有声视频:对白/音效/配乐)。provider 不支持时静默忽略',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  generateAudio?: boolean;
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
