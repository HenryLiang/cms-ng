import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { PublishStatus } from '@cms-ng/shared';

export class UpdatePublishDto {
  @IsEnum(PublishStatus)
  @IsOptional()
  status?: PublishStatus;

  @IsUrl()
  @IsOptional()
  publishedUrl?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
