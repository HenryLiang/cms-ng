import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ArticleStatus, ContentLanguage } from '@cms-ng/shared';

export class CreateStoryDto {
  @ApiProperty({
    description: 'Short headline describing the story',
    example: 'Rise of AI in newsrooms',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Longer description of the story context',
    example: 'A look at how newsrooms are adopting AI tools in 2026.',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'The specific angle or hook for the story',
    example: 'Cost savings and editorial quality trade-offs',
    required: false,
  })
  @IsString()
  @IsOptional()
  angle?: string;

  @ApiProperty({
    description: 'Workflow status for the story',
    enum: ArticleStatus,
    example: ArticleStatus.DRAFT,
    required: false,
  })
  @IsEnum(ArticleStatus)
  @IsOptional()
  status?: ArticleStatus;

  @ApiProperty({
    description: 'Priority level (higher = more urgent)',
    example: 5,
    required: false,
  })
  @IsInt()
  @IsOptional()
  priority?: number;

  @ApiProperty({
    description: 'Tags categorizing the story',
    example: ['AI', 'media'],
    required: false,
    type: [String],
  })
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiProperty({
    description: 'ISO 8601 deadline by which the story should be covered',
    example: '2026-07-01T00:00:00Z',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  deadline?: string;

  @ApiProperty({
    description: 'Primary language for the story content',
    enum: ContentLanguage,
    example: ContentLanguage.ENGLISH,
    required: false,
  })
  @IsEnum(ContentLanguage)
  @IsOptional()
  contentLanguage?: ContentLanguage;
}
