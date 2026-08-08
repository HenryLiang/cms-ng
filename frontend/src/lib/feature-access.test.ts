import { describe, expect, it } from 'vitest';
import { SystemFeature, UserRole } from '@cms-ng/shared';
import {
  canUseFeature,
  createDefaultFeatureStatuses,
  featureForPath,
} from './feature-access';

describe('feature access', () => {
  it('defaults every feature to open when status loading fails', () => {
    expect(createDefaultFeatureStatuses()).toEqual(
      expect.objectContaining({
        [SystemFeature.ARTICLES]: true,
        [SystemFeature.MEDIA]: true,
        [SystemFeature.ACCOUNTS]: true,
      }),
    );
  });

  it('maps nested dashboard routes to their top-level feature', () => {
    expect(featureForPath('/dashboard/articles/article-id')).toBe(
      SystemFeature.ARTICLES,
    );
    expect(featureForPath('/dashboard/billing/transactions')).toBe(
      SystemFeature.BILLING,
    );
    expect(featureForPath('/dashboard/profile')).toBeNull();
  });

  it('combines the feature switch and role policy', () => {
    const statuses = createDefaultFeatureStatuses();
    statuses[SystemFeature.REVIEW] = false;

    expect(
      canUseFeature(SystemFeature.REVIEW, UserRole.EDITOR, statuses),
    ).toBe(false);
    expect(
      canUseFeature(SystemFeature.REVIEW, UserRole.REPORTER, {
        ...statuses,
        [SystemFeature.REVIEW]: true,
      }),
    ).toBe(false);
    expect(
      canUseFeature(SystemFeature.REVIEW, UserRole.SUPER_ADMIN, {
        ...statuses,
        [SystemFeature.REVIEW]: true,
      }),
    ).toBe(true);
  });

  it('keeps account recovery available to SUPER_ADMIN when closed', () => {
    const statuses = createDefaultFeatureStatuses();
    statuses[SystemFeature.ACCOUNTS] = false;

    expect(
      canUseFeature(SystemFeature.ACCOUNTS, UserRole.ADMIN, statuses),
    ).toBe(false);
    expect(
      canUseFeature(SystemFeature.ACCOUNTS, UserRole.SUPER_ADMIN, statuses),
    ).toBe(true);
  });
});
