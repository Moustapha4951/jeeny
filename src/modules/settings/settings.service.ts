import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SettingsService implements OnModuleInit {
  private settingsCache = new Map<string, { value: any; category: string }>();

  constructor(private readonly prismaService: PrismaService) {}

  async onModuleInit() {
    // Load all settings into cache on startup
    await this.reloadCache();
  }

  private async reloadCache() {
    const settings = await this.prismaService.systemSetting.findMany({
      select: { key: true, value: true, category: true },
    });
    this.settingsCache.clear();
    settings.forEach((s) => {
      this.settingsCache.set(s.key, { value: s.value, category: s.category });
    });
  }

  async findAll(category?: string) {
    const entries = Array.from(this.settingsCache.entries());
    const result = entries
      .filter(([, v]) => !category || v.category === category)
      .map(([key, v]) => ({ key, value: v.value, category: v.category }));
    return result;
  }

  async findByKey(key: string) {
    const cached = this.settingsCache.get(key);
    if (cached) {
      return { key, value: cached.value, category: cached.category };
    }
    const setting = await this.prismaService.systemSetting.findUnique({
      where: { key },
      select: { key: true, value: true, category: true },
    });
    if (!setting) {
      throw new Error('Setting not found');
    }
    return setting;
  }

  async get(key: string, defaultValue?: any) {
    const cached = this.settingsCache.get(key);
    if (cached) {
      return cached.value;
    }
    const setting = await this.prismaService.systemSetting.findUnique({
      where: { key },
    });
    if (setting) {
      this.settingsCache.set(key, { value: setting.value, category: setting.category });
      return setting.value;
    }
    return defaultValue;
  }

  async create(data: { key: string; value: any; category?: string; description?: string }) {
    const setting = await this.prismaService.systemSetting.create({
      data: {
        key: data.key,
        value: data.value,
        category: data.category || 'general',
        descriptionAr: data.description,
      },
    });
    this.settingsCache.set(data.key, { value: data.value, category: data.category || 'general' });
    return setting;
  }

  async update(key: string, value: any) {
    const setting = await this.prismaService.systemSetting.update({
      where: { key },
      data: { value },
    });
    this.settingsCache.set(key, { ...this.settingsCache.get(key), value });
    return setting;
  }

  async remove(key: string) {
    await this.prismaService.systemSetting.delete({ where: { key } });
    this.settingsCache.delete(key);
    return { deleted: true };
  }

  async seedDefaults() {
    const defaults = [
      {
        key: 'matching_strategy',
        value: 'NEAREST',
        category: 'matching',
        descriptionAr: 'Driver matching algorithm: ALL, NEAREST, ROUND_ROBIN, MANUAL',
      },
      {
        key: 'matching_max_drivers',
        value: 5,
        category: 'matching',
        descriptionAr: 'Maximum number of drivers to notify per ride',
      },
      {
        key: 'matching_radius_km',
        value: 10,
        category: 'matching',
        descriptionAr: 'Maximum distance (km) for NEAREST strategy',
      },
      {
        key: 'commission_rate_percent',
        value: 15,
        category: 'payment',
        descriptionAr: 'Platform commission percentage (e.g., 15 for 15%)',
      },
      {
        key: 'ride_offer_expiry_seconds',
        value: 30,
        category: 'matching',
        descriptionAr: 'How long driver has to accept/reject ride offer',
      },
      {
        key: 'default_currency',
        value: 'MRU',
        category: 'pricing',
        descriptionAr: 'Default currency code',
      },
      {
        key: 'min_driver_rating',
        value: 4.0,
        category: 'matching',
        descriptionAr: 'Minimum driver rating to receive ride offers',
      },
    ];

    for (const def of defaults) {
      const exists = await this.prismaService.systemSetting.findUnique({
        where: { key: def.key },
      });
      if (!exists) {
        await this.prismaService.systemSetting.create({
          data: def,
        });
      }
    }

    await this.reloadCache();
  }
}
