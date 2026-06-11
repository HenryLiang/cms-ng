import { IsNumber, IsOptional, IsBoolean, IsString, Min } from 'class-validator';

export class UpdateBillingConfigDto {
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsString()
  @IsOptional()
  itemName?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
