import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GenerateDraftFromResearchKitDto {
  @IsNotEmpty()
  researchKit: any;

  @IsOptional()
  @IsString()
  instruction?: string;
}
