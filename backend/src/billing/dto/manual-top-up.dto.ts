import { IsNumber, IsString, IsUUID, IsOptional, Min } from 'class-validator';

export class ManualTopUpDto {
  @IsUUID()
  targetUserId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsOptional()
  reason?: string;
}
