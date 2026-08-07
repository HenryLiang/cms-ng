import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVideoJobDto {
  @ApiProperty({ description: '文生视频 prompt(画面描述)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  prompt!: string;

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
