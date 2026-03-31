import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface FareCalculation {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  surgeFare: number;
  subtotal: number;
  discount: number;
  total: number;
  currency: string;
}

@Injectable()
export class FareService {
  constructor(private prisma: PrismaService) {}

  async calculateFare(
    vehicleTypeId: string,
    distanceKm: number,
    durationMinutes: number,
    surgeMultiplier: number = 1.0,
    promoCode?: string,
  ): Promise<FareCalculation> {
    // Get vehicle type pricing
    const vehicleType = await this.prisma.vehicleType.findUnique({
      where: { id: vehicleTypeId },
    });

    if (!vehicleType) {
      throw new Error('Vehicle type not found');
    }

    // Calculate base components
    const baseFare = vehicleType.baseFare;
    const distanceFare = distanceKm * vehicleType.perKmRate;
    const timeFare = durationMinutes * vehicleType.perMinuteRate;

    // Calculate subtotal before surge
    let subtotal = baseFare + distanceFare + timeFare;

    // Apply minimum fare
    if (subtotal < vehicleType.minimumFare) {
      subtotal = vehicleType.minimumFare;
    }

    // Apply surge pricing
    const surgeFare = subtotal * (surgeMultiplier - 1);
    subtotal = subtotal * surgeMultiplier;

    // Apply promo code discount
    let discount = 0;
    if (promoCode) {
      discount = await this.calculatePromoDiscount(promoCode, subtotal);
    }

    const total = subtotal - discount;

    return {
      baseFare,
      distanceFare,
      timeFare,
      surgeFare,
      subtotal,
      discount,
      total,
      currency: 'MRU',
    };
  }

  async calculatePromoDiscount(promoCode: string, subtotal: number): Promise<number> {
    const promo = await this.prisma.promo.findUnique({
      where: { code: promoCode },
    });

    if (!promo) {
      return 0;
    }

    // Check if promo is valid
    const now = new Date();
    if (promo.startDate > now || promo.endDate < now) {
      return 0;
    }

    if (!promo.isActive) {
      return 0;
    }

    // Check usage limits
    if (promo.maxUses && promo.usedCount >= promo.maxUses) {
      return 0;
    }

    // Calculate discount
    let discount = 0;
    if (promo.discountType === 'PERCENTAGE') {
      discount = (subtotal * promo.discountValue) / 100;
      if (promo.maxDiscountAmount && discount > promo.maxDiscountAmount) {
        discount = promo.maxDiscountAmount;
      }
    } else if (promo.discountType === 'FIXED') {
      discount = promo.discountValue;
    }

    // Check minimum order amount
    if (promo.minOrderAmount && subtotal < promo.minOrderAmount) {
      return 0;
    }

    return discount;
  }

  async estimateFare(
    vehicleTypeId: string,
    pickupLat: number,
    pickupLng: number,
    dropoffLat: number,
    dropoffLng: number,
    promoCode?: string,
  ): Promise<FareCalculation> {
    // Calculate distance using Haversine formula
    const distanceKm = this.calculateDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);

    // Estimate duration (assuming average speed of 30 km/h in city)
    const durationMinutes = (distanceKm / 30) * 60;

    // Get surge multiplier for pickup location
    const surgeMultiplier = await this.getSurgeMultiplier(pickupLat, pickupLng);

    return this.calculateFare(
      vehicleTypeId,
      distanceKm,
      durationMinutes,
      surgeMultiplier,
      promoCode,
    );
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private async getSurgeMultiplier(latitude: number, longitude: number): Promise<number> {
    // Check if location is in a surge zone
    const zones = await this.prisma.zone.findMany({
      where: { isActive: true },
    });

    for (const zone of zones) {
      if (this.isPointInPolygon(latitude, longitude, zone.polygon as any)) {
        return zone.surgeMultiplier || 1.0;
      }
    }

    return 1.0;
  }

  private isPointInPolygon(lat: number, lng: number, polygon: Array<{ lat: number; lng: number }>): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng;
      const yi = polygon[i].lat;
      const xj = polygon[j].lng;
      const yj = polygon[j].lat;

      const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }
}
