import { IsString, IsOptional, IsInt, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TopicStatus } from '@prisma/client';

export class CreateTopicDto {
  @ApiProperty({
    description: 'Headline of the trending topic',
    example: 'AI regulation debates intensify',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Optional longer description of the topic',
    example: 'Lawmakers are debating new rules for foundation models.',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Source the topic was aggregated from',
    example: 'google-trends',
    required: false,
  })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiProperty({
    description: 'Heat/trending score (higher = more popular right now)',
    example: 87,
    required: false,
  })
  @IsInt()
  @IsOptional()
  heatScore?: number;

  @ApiProperty({
    description: 'Tags classifying the topic',
    example: ['AI', 'policy'],
    required: false,
    type: [String],
  })
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiProperty({
    description: 'Lifecycle status of the trending topic',
    enum: TopicStatus,
    example: 'OPEN',
    required: false,
  })
  @IsEnum(TopicStatus)
  @IsOptional()
  status?: TopicStatus;
}
