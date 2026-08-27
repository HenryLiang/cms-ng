import { create } from "zustand";
import {
  DEFAULT_BRAND_PRESET,
  type BrandSettings,
} from "@cms-ng/shared";
import {
  getBrandSettings,
  type SystemBrandSettings,
} from "@/lib/brand-settings-api";

interface BrandStore {
  brand: SystemBrandSettings;
  isLoaded: boolean;
  isLoading: boolean;
  load: (force?: boolean) => Promise<void>;
  setBrand: (brand: SystemBrandSettings) => void;
  reset: () => void;
}

const defaultBrand: BrandSettings = {
  preset: DEFAULT_BRAND_PRESET.key,
  name: DEFAULT_BRAND_PRESET.name,
  logoUrl: DEFAULT_BRAND_PRESET.logoUrl,
  isCustom: false,
};

const initialState = () => ({
  brand: { ...defaultBrand },
  isLoaded: false,
  isLoading: false,
});

export const useBrandStore = create<BrandStore>((set, get) => ({
  ...initialState(),
  load: async (force = false) => {
    if ((!force && get().isLoaded) || get().isLoading) return;
    set({ isLoading: true });
    try {
      const brand = await getBrandSettings();
      set({ brand, isLoaded: true, isLoading: false });
    } catch {
      set({ brand: { ...defaultBrand }, isLoaded: true, isLoading: false });
    }
  },
  setBrand: (brand) => set({ brand, isLoaded: true, isLoading: false }),
  reset: () => set(initialState()),
}));
