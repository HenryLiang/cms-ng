import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateMediaDto {
  @ApiProperty({ description: 'alt 替换文本（无障碍 + SEO）', required: false })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  altText?: string;

  @ApiProperty({ description: '标题', required: false })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  title?: string;

  @ApiProperty({ description: '描述', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: '标签数组',
    type: [String],
    example: ['新闻', '封面'],
    required: false,
  })
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
