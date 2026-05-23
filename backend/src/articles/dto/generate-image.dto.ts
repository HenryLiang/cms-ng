import { IsString, IsOptional, IsIn } from 'class-validator';

export class GenerateImageDto {
  @IsIn(['news', 'illustration', 'photo', 'social'])
  @IsOptional()
  style?: 'news' | 'illustration' | 'photo' | 'social';

  @IsString()
  @IsOptional()
  aspectRatio?: string;

  @IsIn(['2K', '3K'])
  @IsOptional()
  size?: '2K' | '3K';

  @IsString()
  @IsOptional()
  customPrompt?: string;
}
