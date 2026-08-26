import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArticleGenre,
  ContentLanguage,
  DEFAULT_DRAFT_WORD_COUNT,
  MAX_DRAFT_WORD_COUNT,
  MIN_DRAFT_WORD_COUNT,
} from '@cms-ng/shared';
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

  @ApiProperty({
    description:
      'Editorial genre used to structure and style the generated draft',
    enum: ArticleGenre,
    example: ArticleGenre.IN_DEPTH_REPORT,
    required: false,
    default: ArticleGenre.STRAIGHT_NEWS,
  })
  @IsOptional()
  @IsEnum(ArticleGenre)
  genre?: ArticleGenre;

  @ApiProperty({
    description:
      'Freely entered target length. Chinese output is measured in characters; English output in words.',
    example: DEFAULT_DRAFT_WORD_COUNT,
    minimum: MIN_DRAFT_WORD_COUNT,
    maximum: MAX_DRAFT_WORD_COUNT,
    required: false,
    default: DEFAULT_DRAFT_WORD_COUNT,
  })
  @IsOptional()
  @IsInt()
  @Min(MIN_DRAFT_WORD_COUNT)
  @Max(MAX_DRAFT_WORD_COUNT)
  targetWordCount?: number;
}
