import { BadRequestException, Injectable } from '@nestjs/common';
import {
  getSystemFeatureDefinition,
  SYSTEM_FEATURE_CATALOG,
  SystemFeature,
  type SystemFeatureDefinition,
} from '@cms-ng/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface SystemFeatureStatus extends SystemFeatureDefinition {
  enabled: boolean;
}

export interface SystemFeatureOperator {
  id: string;
  name: string;
  email: string;
}

export interface SystemFeatureDetail extends SystemFeatureStatus {
  reason: string | null;
  updatedAt: Date | null;
  updatedBy: SystemFeatureOperator | null;
}

@Injectable()
export class SystemFeaturesService {
  private cache: Map<SystemFeature, boolean> | null = null;
  private cacheExpiresAt = 0;
  private static readonly CACHE_TTL_MS = 5_000;

  constructor(private readonly prisma: PrismaService) {}

  async getStatuses(): Promise<SystemFeatureStatus[]> {
    const state = await this.getState();
    return SYSTEM_FEATURE_CATALOG.map((definition) => ({
      ...definition,
      enabled: state.get(definition.key) ?? true,
    }));
  }

  async getDetails(): Promise<SystemFeatureDetail[]> {
    const rows = await this.prisma.systemFeatureSwitch.findMany({
      include: {
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });
    const byFeature = new Map(
      rows.map((row) => [row.feature as SystemFeature, row]),
    );

    this.cache = new Map(
      rows.map((row) => [row.feature as SystemFeature, row.enabled]),
    );
    this.cacheExpiresAt = Date.now() + SystemFeaturesService.CACHE_TTL_MS;

    return SYSTEM_FEATURE_CATALOG.map((definition) => {
      const row = byFeature.get(definition.key);
      return {
        ...definition,
        enabled: row?.enabled ?? true,
        reason: row?.reason ?? null,
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedBy ?? null,
      };
    });
  }

  async isEnabled(feature: SystemFeature): Promise<boolean> {
    const state = await this.getState();
    return state.get(feature) ?? true;
  }

  async getAudit(feature: SystemFeature) {
    getSystemFeatureDefinition(feature);
    return this.prisma.systemFeatureAudit.findMany({
      where: { feature },
      include: {
        operator: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async setEnabled(
    feature: SystemFeature,
    enabled: boolean,
    operatorId: string,
    reason?: string,
  ): Promise<SystemFeatureDetail> {
    const definition = getSystemFeatureDefinition(feature);
    if (!definition.configurable) {
      throw new BadRequestException('该功能不可关闭');
    }
    if (!enabled && !reason?.trim()) {
      throw new BadRequestException('关闭功能时必须填写原因');
    }

    const normalizedReason = reason?.trim() || null;
    const row = await this.prisma.$transaction(
      async (tx) => {
        // The no-op upsert creates a lockable default-open row when a feature is
        // first introduced, and takes an exclusive row lock when it already exists.
        await tx.$executeRaw`
        INSERT INTO system_feature_switches
          (feature, enabled, updatedById, reason, createdAt, updatedAt)
        VALUES
          (${feature}, TRUE, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE feature = VALUES(feature)
      `;
        await tx.$queryRaw<Array<{ feature: string }>>`
        SELECT feature
        FROM system_feature_switches
        WHERE feature = ${feature}
        FOR UPDATE
      `;

        const existing = await tx.systemFeatureSwitch.findUnique({
          where: { feature },
          include: {
            updatedBy: { select: { id: true, name: true, email: true } },
          },
        });
        const previousEnabled = existing?.enabled ?? true;
        if (previousEnabled === enabled) {
          return existing;
        }

        const updated = await tx.systemFeatureSwitch.upsert({
          where: { feature },
          create: {
            feature,
            enabled,
            updatedById: operatorId,
            reason: normalizedReason,
          },
          update: {
            enabled,
            updatedById: operatorId,
            reason: normalizedReason,
          },
          include: {
            updatedBy: { select: { id: true, name: true, email: true } },
          },
        });
        await tx.systemFeatureAudit.create({
          data: {
            feature,
            previousEnabled,
            enabled,
            operatorId,
            reason: normalizedReason,
          },
        });
        return updated;
      },
      {
        isolationLevel: 'ReadCommitted',
        maxWait: 5_000,
        timeout: 10_000,
      },
    );

    this.cache = null;
    this.cacheExpiresAt = 0;
    return {
      ...definition,
      enabled,
      reason: row?.reason ?? null,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  }

  private async getState(): Promise<Map<SystemFeature, boolean>> {
    if (this.cache && Date.now() < this.cacheExpiresAt) {
      return this.cache;
    }

    const rows = await this.prisma.systemFeatureSwitch.findMany({
      select: { feature: true, enabled: true },
    });
    this.cache = new Map(
      rows.map((row) => [row.feature as SystemFeature, row.enabled]),
    );
    this.cacheExpiresAt = Date.now() + SystemFeaturesService.CACHE_TTL_MS;
    return this.cache;
  }
}
