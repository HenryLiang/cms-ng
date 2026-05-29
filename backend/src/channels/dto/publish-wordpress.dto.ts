import { IsIn, IsOptional, IsString } from 'class-validator';

export class PublishWordPressDto {
  @IsString()
  @IsIn(['publish', 'draft'])
  @IsOptional()
  wpStatus?: 'publish' | 'draft';
}
