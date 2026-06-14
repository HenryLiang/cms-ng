import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PublishStatus } from '@cms-ng/shared';

export class UpdatePublishDto {
  @ApiProperty({
    description: 'New publish status for the platform publish record',
    enum: PublishStatus,
    example: PublishStatus.PUBLISHED,
    required: false,
  })
  @IsEnum(PublishStatus)
  @IsOptional()
  status?: PublishStatus;

  @ApiProperty({
    description: 'URL where the article is publicly visible after publishing',
    example: 'https://example.com/posts/123',
    required: false,
  })
  @IsUrl()
  @IsOptional()
  publishedUrl?: string;

  @ApiProperty({
    description: 'Free-form editor notes about this publish record',
    example: 'Posted via auto-scheduler at 09:00 HKT',
    required: false,
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
