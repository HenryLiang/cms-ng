import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRefundDto {
  @ApiProperty({
    description: 'UUID of the original transaction to refund',
    example: '8a3b1c52-7f1d-4d2e-9b1f-3a4b5c6d7e8f',
  })
  @IsUUID()
  originalTransactionId: string;

  @ApiProperty({
    description: 'Human-readable reason for the refund',
    example: 'Customer reported duplicate charge',
  })
  @IsString()
  reason: string;

  @ApiProperty({
    description:
      'Amount to refund in credits. If omitted, refunds the full original amount',
    example: 10,
    minimum: 0.0001,
    required: false,
  })
  @IsNumber()
  @Min(0.0001)
  @IsOptional()
  refundAmount?: number;
}
