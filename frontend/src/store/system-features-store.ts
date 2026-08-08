import { create } from 'zustand';
import { SystemFeature } from '@cms-ng/shared';
import { getFeatureStatuses } from '@/lib/system-features-api';
import {
  createDefaultFeatureStatuses,
  type FeatureStatuses,
} from '@/lib/feature-access';

interface SystemFeaturesStore {
  statuses: FeatureStatuses;
  isLoaded: boolean;
  isLoading: boolean;
  load: (force?: boolean) => Promise<void>;
  setStatus: (feature: SystemFeature, enabled: boolean) => void;
  reset: () => void;
}

const initialState = () => ({
  statuses: createDefaultFeatureStatuses(),
  isLoaded: false,
  isLoading: false,
});

export const useSystemFeaturesStore = create<SystemFeaturesStore>((set, get) => ({
  ...initialState(),
  load: async (force = false) => {
    if ((!force && get().isLoaded) || get().isLoading) return;
    set({ isLoading: true });
    try {
      const response = await getFeatureStatuses();
      const statuses = createDefaultFeatureStatuses();
      for (const item of response) statuses[item.key] = item.enabled;
      set({ statuses, isLoaded: true, isLoading: false });
    } catch {
      set({
        statuses: createDefaultFeatureStatuses(),
        isLoaded: true,
        isLoading: false,
      });
    }
  },
  setStatus: (feature, enabled) =>
    set((state) => ({
      statuses: { ...state.statuses, [feature]: enabled },
    })),
  reset: () => set(initialState()),
}));
