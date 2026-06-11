import { IsNumber, IsBoolean, IsOptional, Min } from 'class-validator';

export class UpdateAlertDto {
  @IsNumber()
  @Min(0)
  thresholdAmount: number;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}
