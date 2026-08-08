import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemFeature } from '@cms-ng/shared';
import { getFeatureStatuses } from '@/lib/system-features-api';
import { useSystemFeaturesStore } from './system-features-store';

vi.mock('@/lib/system-features-api', () => ({
  getFeatureStatuses: vi.fn(),
}));

describe('system-features-store', () => {
  beforeEach(() => {
    useSystemFeaturesStore.getState().reset();
    vi.clearAllMocks();
  });

  it('loads effective feature statuses', async () => {
    vi.mocked(getFeatureStatuses).mockResolvedValue([
      {
        key: SystemFeature.MEDIA,
        label: '媒体库',
        description: '',
        group: 'WORKSPACE',
        configurable: true,
        roles: [],
        enabled: false,
      },
    ]);

    await useSystemFeaturesStore.getState().load();

    expect(
      useSystemFeaturesStore.getState().statuses[SystemFeature.MEDIA],
    ).toBe(false);
    expect(useSystemFeaturesStore.getState().isLoaded).toBe(true);
  });

  it('fails open when the status endpoint is unavailable', async () => {
    vi.mocked(getFeatureStatuses).mockRejectedValue(new Error('offline'));

    await useSystemFeaturesStore.getState().load();

    expect(
      useSystemFeaturesStore.getState().statuses[SystemFeature.MEDIA],
    ).toBe(true);
    expect(useSystemFeaturesStore.getState().isLoaded).toBe(true);
  });
});
