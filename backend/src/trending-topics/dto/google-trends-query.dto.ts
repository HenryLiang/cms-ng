import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleTrendsQueryDto {
  @ApiProperty({
    description: 'ISO country code (e.g. HK, US, JP) for geographic filtering',
    example: 'HK',
    required: false,
  })
  @IsString()
  @IsOptional()
  geo?: string = 'HK';

  @ApiProperty({
    description: '1-based page number for pagination',
    example: 1,
    minimum: 1,
    required: false,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiProperty({
    description: 'Maximum number of results to return',
    example: 10,
    minimum: 1,
    required: false,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;
}
