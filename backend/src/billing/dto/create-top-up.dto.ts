import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateTopUpDto {
  @IsNumber()
  @Min(10)
  amount: number;

  @IsEnum(['ALIPAY', 'WECHAT_PAY'])
  paymentMethod: string;

  @IsString()
  @IsOptional()
  packageId?: string;
}
