import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AutoTaskStatus } from '@cms-ng/shared';
import { CreateTaskDto } from './create-task.dto';

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @ApiProperty({
    description: 'Lifecycle status of the auto-publish task',
    enum: AutoTaskStatus,
    example: AutoTaskStatus.ACTIVE,
    required: false,
  })
  @IsOptional()
  @IsEnum(AutoTaskStatus)
  status?: AutoTaskStatus;
}
