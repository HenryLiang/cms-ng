import { IsNotEmpty, IsOptional, IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ContentLanguage } from '@cms-ng/shared';
import type { ResearchKitResult } from '../../ai/dto/writing-operations.dto';

export class GenerateDraftFromResearchKitDto {
  @ApiProperty({
    description:
      'Research kit payload assembled from earlier research step (timeline, people, data, opinions, etc.)',
    example: {
      timeline: [{ date: '2026-01-01', event: 'Initial launch' }],
      people: [],
      data: [],
      opinions: [],
    },
  })
  @IsNotEmpty()
  researchKit: ResearchKitResult;

  @ApiProperty({
    description: 'Optional additional instruction guiding the draft',
    example: 'Open with a hook and end with a quote',
    required: false,
  })
  @IsOptional()
  @IsString()
  instruction?: string;

  @ApiProperty({
    description: 'Output language for the generated draft',
    enum: ContentLanguage,
    example: ContentLanguage.ENGLISH,
    required: false,
  })
  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;

  @ApiProperty({
    description:
      'Optional author persona slug (e.g. "author-luxun") from data/authors/. When set, the draft adopts that author\'s voice.',
    example: 'author-luxun',
    required: false,
  })
  @IsOptional()
  @IsString()
  authorSlug?: string;
}
