import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { QueryMediaDto } from './dto/query-media.dto';
import { UpdateMediaDto } from './dto/update-media.dto';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('media')
@ApiBearerAuth('bearer')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @ApiOperation({ summary: '上传图片（多文件，后端中转存 COS + 入库）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      limits: { fileSize: 10 * 1024 * 1024, files: 20 },
    }),
  )
  async upload(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('userId') userId: string,
  ) {
    return this.mediaService.upload(files ?? [], userId);
  }

  @Get()
  @ApiOperation({ summary: '媒体库列表（个人库，分页/筛选/搜索）' })
  findAll(
    @CurrentUser('userId') userId: string,
    @Query() query: QueryMediaDto,
  ) {
    return this.mediaService.findAll(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '媒体资源详情' })
  findOne(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.mediaService.findOne(id, userId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: '更新媒体元信息（alt/title/description/tags/status）',
  })
  update(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateMediaDto,
  ) {
    return this.mediaService.update(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除媒体资源（软删 + 删 COS 对象）' })
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.mediaService.remove(id, userId);
  }
}
