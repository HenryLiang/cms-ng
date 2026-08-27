import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  UserRole,
  type ApiResponse,
  type LanguageSettings,
} from '@cms-ng/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { UpdateLanguageSettingsDto } from './dto/update-language-settings.dto';
import { LanguageSettingsService } from './language-settings.service';

@ApiTags('language-settings')
@Controller('language-settings')
export class LanguageSettingsController {
  constructor(private readonly settings: LanguageSettingsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get system language defaults' })
  @ApiOkResponse({ description: 'System language defaults in ApiResponse' })
  async get(): Promise<ApiResponse<LanguageSettings>> {
    const { displayLanguage, contentLanguage } = await this.settings.get();
    return { success: true, data: { displayLanguage, contentLanguage } };
  }

  @Patch()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Update system language defaults (super admin only)',
  })
  @ApiOkResponse({ description: 'Updated language defaults in ApiResponse' })
  async update(
    @Body() dto: UpdateLanguageSettingsDto,
    @CurrentUser('userId') operatorId: string,
  ): Promise<
    ApiResponse<Awaited<ReturnType<LanguageSettingsService['update']>>>
  > {
    return {
      success: true,
      data: await this.settings.update(dto, operatorId),
    };
  }
}
