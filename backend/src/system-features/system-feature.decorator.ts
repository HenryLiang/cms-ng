import { SetMetadata } from '@nestjs/common';
import { SystemFeature } from '@cms-ng/shared';

export const SYSTEM_FEATURES_KEY = 'systemFeatures';

/** Allow the HTTP entry when any listed feature is effectively open. */
export const RequiresSystemFeature = (...features: SystemFeature[]) =>
  SetMetadata(SYSTEM_FEATURES_KEY, features);
