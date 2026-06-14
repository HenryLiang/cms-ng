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
    description: 'Time range to look back over (e.g. 24h, 7d, 30d)',
    example: '24h',
    required: false,
  })
  @IsString()
  @IsOptional()
  timeRange?: string = '24h';

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
