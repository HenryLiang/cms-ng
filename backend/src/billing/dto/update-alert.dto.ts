import { IsNumber, IsBoolean, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAlertDto {
  @ApiProperty({
    description:
      'Spend threshold in credits that triggers the low-balance alert',
    example: 50,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  thresholdAmount: number;

  @ApiProperty({
    description: 'Whether the low-balance alert is enabled',
    example: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}
