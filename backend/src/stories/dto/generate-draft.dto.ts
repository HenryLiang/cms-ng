import { IsNotEmpty, IsOptional, IsString, IsIn } from 'class-validator';
import { ContentLanguage } from '@cms-ng/shared';

export class GenerateDraftFromResearchKitDto {
  @IsNotEmpty()
  researchKit: any;

  @IsOptional()
  @IsString()
  instruction?: string;

  @IsIn(Object.values(ContentLanguage))
  @IsOptional()
  language?: ContentLanguage;
}
