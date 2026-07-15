import {
  IsNumber,
  IsOptional,
  IsBoolean,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateBillingConfigDto {
  @ApiProperty({
    description: 'Per-unit price in credits used for cost calculations',
    example: 0.01,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiProperty({
    description: 'Display name for the billable item',
    example: 'AI rewrite (per 1k tokens)',
    required: false,
  })
  @IsString()
  @IsOptional()
  itemName?: string;

  @ApiProperty({
    description: 'Whether this billing configuration is active and used',
    example: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
