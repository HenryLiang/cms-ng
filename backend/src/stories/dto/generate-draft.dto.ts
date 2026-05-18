import { IsOptional, IsString } from 'class-validator';
import { ResearchKitResult } from '../../ai/dto/writing-operations.dto';

export class GenerateDraftFromResearchKitDto {
  researchKit: ResearchKitResult;

  @IsOptional()
  @IsString()
  instruction?: string;
}
