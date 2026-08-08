import {
  getSystemFeatureDefinition,
  hasRequiredRole,
  SYSTEM_FEATURE_CATALOG,
  SystemFeature,
  UserRole,
} from '@cms-ng/shared';

export type FeatureStatuses = Record<SystemFeature, boolean>;

export function createDefaultFeatureStatuses(): FeatureStatuses {
  return Object.fromEntries(
    SYSTEM_FEATURE_CATALOG.map(({ key }) => [key, true]),
  ) as FeatureStatuses;
}

const DASHBOARD_FEATURE_PATHS: ReadonlyArray<
  readonly [prefix: string, feature: SystemFeature]
> = [
  ['/dashboard/articles', SystemFeature.ARTICLES],
  ['/dashboard/media', SystemFeature.MEDIA],
  ['/dashboard/video', SystemFeature.VIDEO],
  ['/dashboard/review', SystemFeature.REVIEW],
  ['/dashboard/stories', SystemFeature.STORIES],
  ['/dashboard/auto-publish', SystemFeature.AUTO_PUBLISH],
  ['/dashboard/billing', SystemFeature.BILLING],
  ['/dashboard/accounts', SystemFeature.ACCOUNTS],
  ['/dashboard/settings', SystemFeature.SETTINGS],
];

export function featureForPath(pathname: string): SystemFeature | null {
  if (pathname === '/dashboard') return SystemFeature.WORKBENCH;
  const match = DASHBOARD_FEATURE_PATHS.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match?.[1] ?? null;
}

export function canUseFeature(
  feature: SystemFeature,
  role: UserRole | string | null | undefined,
  statuses: FeatureStatuses,
): boolean {
  const definition = getSystemFeatureDefinition(feature);
  if (
    definition.superAdminAlwaysAvailable &&
    role === UserRole.SUPER_ADMIN
  ) {
    return true;
  }
  return (
    statuses[feature] !== false && hasRequiredRole(role, definition.roles)
  );
}
