import { IsString, IsOptional, IsInt, IsEnum } from 'class-validator';
import { TopicStatus } from '@prisma/client';

export class CreateTopicDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsInt()
  @IsOptional()
  heatScore?: number;

  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsEnum(TopicStatus)
  @IsOptional()
  status?: TopicStatus;
}
