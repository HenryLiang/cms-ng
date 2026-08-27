import {
  Body,
  Controller,
  Get,
  Patch,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  BrandPreset,
  UserRole,
  type ApiResponse,
  type BrandSettings,
} from '@cms-ng/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { BrandSettingsService } from './brand-settings.service';
import { UpdateBrandSettingsDto } from './dto/update-brand-settings.dto';

@ApiTags('brand-settings')
@Controller('brand-settings')
export class BrandSettingsController {
  constructor(private readonly settings: BrandSettingsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get the active system brand' })
  @ApiOkResponse({ description: 'Active brand wrapped in ApiResponse' })
  async get(): Promise<ApiResponse<BrandSettings>> {
    const { preset, name, logoUrl, isCustom } = await this.settings.get();
    return {
      success: true,
      data: { preset, name, logoUrl, isCustom },
    };
  }

  @Patch()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth('bearer')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update the system brand (super admin only)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['preset'],
      properties: {
        preset: {
          type: 'string',
          enum: Object.values(BrandPreset),
          description: 'CUSTOM requires a name and a logo on first use',
        },
        name: {
          type: 'string',
          minLength: 2,
          maxLength: 40,
          description: 'Required only for CUSTOM',
        },
        logo: {
          type: 'string',
          format: 'binary',
          description: 'CUSTOM only; PNG, JPG, or WebP up to 2 MB',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('logo', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  async update(
    @Body() dto: UpdateBrandSettingsDto,
    @CurrentUser('userId') operatorId: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ApiResponse<Awaited<ReturnType<BrandSettingsService['update']>>>> {
    return {
      success: true,
      data: await this.settings.update(dto, operatorId, file),
    };
  }
}
