import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ArticleStatus, ContentLanguage } from '@cms-ng/shared';

export class CreateArticleDto {
  @ApiProperty({
    description: 'UUID of the story this article belongs to',
    example: '8a3b1c52-7f1d-4d2e-9b1f-3a4b5c6d7e8f',
  })
  @IsUUID()
  storyId: string;

  @ApiProperty({
    description: 'Article headline shown in lists and the article page',
    example: 'Breaking: Major AI breakthrough announced',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Optional subheadline under the main title',
    example: 'How the new model changes the industry',
    required: false,
  })
  @IsString()
  @IsOptional()
  subtitle?: string;

  @ApiProperty({
    description: 'Full article body in HTML/Markdown',
    example: '<p>The team announced...</p>',
  })
  @IsString()
  content: string;

  @ApiProperty({
    description: 'Short summary used for previews and SEO meta description',
    example: 'A concise summary of the article content.',
    required: false,
  })
  @IsString()
  @IsOptional()
  excerpt?: string;

  @ApiProperty({
    description: 'Workflow status of the article',
    enum: ArticleStatus,
    example: ArticleStatus.DRAFT,
    required: false,
  })
  @IsEnum(ArticleStatus)
  @IsOptional()
  status?: ArticleStatus;

  @ApiProperty({
    description: 'Tags associated with the article',
    example: ['AI', 'news'],
    required: false,
    type: [String],
  })
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiProperty({
    description: 'Language the article is written in',
    enum: ContentLanguage,
    example: ContentLanguage.ENGLISH,
    required: false,
  })
  @IsEnum(ContentLanguage)
  @IsOptional()
  contentLanguage?: ContentLanguage;

  @ApiProperty({
    description: 'URL of the cover image for the article',
    example: 'https://cdn.example.com/cover.jpg',
    required: false,
  })
  @IsString()
  @IsOptional()
  coverImage?: string;
}
