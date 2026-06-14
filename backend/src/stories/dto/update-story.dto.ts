import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty } from '@nestjs/swagger';
import { CreateStoryDto } from './create-story.dto';

export class UpdateStoryDto extends PartialType(CreateStoryDto) {}
