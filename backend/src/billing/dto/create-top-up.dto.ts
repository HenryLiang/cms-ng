import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTopUpDto {
  @ApiProperty({
    description: 'Amount of credits to purchase',
    example: 100,
    minimum: 10,
  })
  @IsNumber()
  @Min(10)
  amount: number;

  @ApiProperty({
    description: 'Payment method used for the top-up',
    enum: ['ALIPAY', 'WECHAT_PAY'],
    example: 'ALIPAY',
  })
  @IsEnum(['ALIPAY', 'WECHAT_PAY'])
  paymentMethod: string;

  @ApiProperty({
    description:
      'Optional pricing package identifier the top-up is associated with',
    example: 'pkg-starter-100',
    required: false,
  })
  @IsString()
  @IsOptional()
  packageId?: string;
}
