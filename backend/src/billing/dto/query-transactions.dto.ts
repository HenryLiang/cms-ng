import { IsOptional, IsInt, IsString, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { TransactionType } from '@cms-ng/shared';

export class QueryTransactionsDto {
  @ApiProperty({
    description: '1-based page number for pagination',
    example: 1,
    minimum: 1,
    required: false,
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 20,
    minimum: 1,
    required: false,
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  pageSize?: number = 20;

  @ApiProperty({
    description: 'Filter by transaction type',
    enum: TransactionType,
    example: TransactionType.TOP_UP,
    required: false,
  })
  @IsEnum(TransactionType)
  @IsOptional()
  type?: TransactionType;

  @ApiProperty({
    description: 'ISO 8601 date string for the inclusive start of the time range',
    example: '2026-01-01',
    required: false,
  })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({
    description: 'ISO 8601 date string for the inclusive end of the time range',
    example: '2026-12-31',
    required: false,
  })
  @IsString()
  @IsOptional()
  endDate?: string;
}
