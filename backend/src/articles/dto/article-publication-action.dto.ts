import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ArchiveArticleDto {
  @ApiProperty({
    description: 'Reason recorded in the article publication audit trail',
    minLength: 2,
    maxLength: 500,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason: string;
}

export class RepublishArticleDto {
  @ApiProperty({
    description:
      'Optional reason recorded in the article publication audit trail',
    required: false,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
