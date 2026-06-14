import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateImageDto {
  @ApiProperty({
    description: 'Visual style preset to use for the generated image',
    enum: ['news', 'illustration', 'photo', 'social'],
    example: 'news',
    required: false,
  })
  @IsIn(['news', 'illustration', 'photo', 'social'])
  @IsOptional()
  style?: 'news' | 'illustration' | 'photo' | 'social';

  @ApiProperty({
    description: 'Image aspect ratio (e.g. 16:9, 1:1, 4:3)',
    example: '16:9',
    required: false,
  })
  @IsString()
  @IsOptional()
  aspectRatio?: string;

  @ApiProperty({
    description: 'Output resolution preset',
    enum: ['2K', '3K', '4K'],
    example: '2K',
    required: false,
  })
  @IsIn(['2K', '3K', '4K'])
  @IsOptional()
  size?: '2K' | '3K' | '4K';

  @ApiProperty({
    description: 'Free-form prompt override for the image model',
    example: 'A futuristic city skyline at sunset',
    required: false,
  })
  @IsString()
  @IsOptional()
  customPrompt?: string;
}
