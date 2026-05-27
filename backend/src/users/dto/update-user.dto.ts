import { IsString, IsEnum, IsOptional } from 'class-validator';
import { ContentLanguage } from '@cms-ng/shared';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsEnum(ContentLanguage)
  @IsOptional()
  preferredLanguage?: ContentLanguage;
}
