import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PublishWordPressDto {
  @ApiProperty({
    description: 'WordPress post status to apply when creating the post',
    enum: ['publish', 'draft'],
    example: 'publish',
    required: false,
  })
  @IsString()
  @IsIn(['publish', 'draft'])
  @IsOptional()
  wpStatus?: 'publish' | 'draft';
}
