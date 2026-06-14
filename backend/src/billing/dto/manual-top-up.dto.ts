import { IsNumber, IsString, IsUUID, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ManualTopUpDto {
  @ApiProperty({
    description: 'UUID of the user receiving the manual top-up',
    example: '8a3b1c52-7f1d-4d2e-9b1f-3a4b5c6d7e8f',
  })
  @IsUUID()
  targetUserId: string;

  @ApiProperty({
    description: 'Amount of credits to add to the user balance',
    example: 100,
    minimum: 0.01,
  })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({
    description: 'Free-text reason for the manual top-up (audit log)',
    example: 'Compensation for service outage on 2026-06-10',
    required: false,
  })
  @IsString()
  @IsOptional()
  reason?: string;
}
