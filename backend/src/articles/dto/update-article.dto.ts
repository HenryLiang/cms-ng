import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateArticleDto } from './create-article.dto';

export class UpdateArticleDto extends PartialType(CreateArticleDto) {
  @ApiProperty({
    description: 'UUID of the editor assigned to review this article',
    example: '5e7c1d8a-2b3a-4f6d-9e0c-1a2b3c4d5e6f',
    required: false,
  })
  @IsUUID()
  @IsOptional()
  editorId?: string;
}
