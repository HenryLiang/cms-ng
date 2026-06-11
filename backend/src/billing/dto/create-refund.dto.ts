import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateRefundDto {
  @IsUUID()
  originalTransactionId: string;

  @IsString()
  reason: string;

  @IsNumber()
  @Min(0.0001)
  @IsOptional()
  refundAmount?: number;
}
