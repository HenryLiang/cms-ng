import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SystemFeature, UserRole, type ApiResponse } from '@cms-ng/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UpdateSystemFeatureDto } from './dto/update-system-feature.dto';
import { SystemFeaturesService } from './system-features.service';

@ApiTags('system-features')
@ApiBearerAuth('bearer')
@Controller('system-features')
export class SystemFeaturesController {
  constructor(private readonly features: SystemFeaturesService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List system feature details (super admin only)' })
  @ApiOkResponse({ description: 'Feature details wrapped in ApiResponse' })
  async findAll(): Promise<
    ApiResponse<Awaited<ReturnType<SystemFeaturesService['getDetails']>>>
  > {
    return { success: true, data: await this.features.getDetails() };
  }

  @Get('status')
  @ApiOperation({ summary: 'Get effective system feature statuses' })
  @ApiOkResponse({ description: 'Feature statuses wrapped in ApiResponse' })
  async status(): Promise<
    ApiResponse<Awaited<ReturnType<SystemFeaturesService['getStatuses']>>>
  > {
    return { success: true, data: await this.features.getStatuses() };
  }

  @Get(':feature/audit')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List feature switch audit history (super admin only)',
  })
  @ApiOkResponse({
    description: 'Feature audit records wrapped in ApiResponse',
  })
  async audit(
    @Param('feature', new ParseEnumPipe(SystemFeature)) feature: SystemFeature,
  ): Promise<
    ApiResponse<Awaited<ReturnType<SystemFeaturesService['getAudit']>>>
  > {
    return { success: true, data: await this.features.getAudit(feature) };
  }

  @Patch(':feature')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Open or close a system feature (super admin only)',
  })
  @ApiOkResponse({ description: 'Updated feature wrapped in ApiResponse' })
  async update(
    @Param('feature', new ParseEnumPipe(SystemFeature)) feature: SystemFeature,
    @Body() dto: UpdateSystemFeatureDto,
    @CurrentUser('userId') operatorId: string,
  ): Promise<
    ApiResponse<Awaited<ReturnType<SystemFeaturesService['setEnabled']>>>
  > {
    return {
      success: true,
      data: await this.features.setEnabled(
        feature,
        dto.enabled,
        operatorId,
        dto.reason,
      ),
    };
  }
}
