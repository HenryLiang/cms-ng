import { Platform } from '@cms-ng/shared';
import { PlatformAdapter } from './platform.adapter';
import { WebsiteAdapter } from './adapters/website.adapter';
import { FacebookAdapter } from './adapters/facebook.adapter';
import { InstagramAdapter } from './adapters/instagram.adapter';
import { XiaohongshuAdapter } from './adapters/xiaohongshu.adapter';

export class PlatformRegistry {
  private static adapters = new Map<Platform, PlatformAdapter>([
    [Platform.WEBSITE, new WebsiteAdapter()],
    [Platform.FACEBOOK, new FacebookAdapter()],
    [Platform.INSTAGRAM, new InstagramAdapter()],
    [Platform.XIAOHONGSHU, new XiaohongshuAdapter()],
  ]);

  static getAdapter(platform: Platform): PlatformAdapter | undefined {
    return this.adapters.get(platform);
  }

  static hasAdapter(platform: Platform): boolean {
    return this.adapters.has(platform);
  }

  static getSupportedPlatforms(): Platform[] {
    return Array.from(this.adapters.keys());
  }
}
