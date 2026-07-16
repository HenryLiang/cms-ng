import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { MediaSource, MediaStatus } from '@cms-ng/shared';

export class QueryMediaDto {
  @ApiProperty({ enum: MediaSource, description: '来源过滤', required: false })
  @IsEnum(MediaSource)
  @IsOptional()
  source?: MediaSource;

  @ApiProperty({
    enum: MediaStatus,
    description: '状态过滤，默认仅 ACTIVE',
    required: false,
  })
  @IsEnum(MediaStatus)
  @IsOptional()
  status?: MediaStatus;

  @ApiProperty({ description: '文件名/alt/title/prompt 模糊搜索', required: false })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiProperty({ description: '标签过滤（单个标签名）', required: false })
  @IsString()
  @IsOptional()
  tag?: string;

  @ApiProperty({ default: 1, minimum: 1, required: false })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiProperty({ default: 20, minimum: 1, required: false })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  pageSize?: number;
}
