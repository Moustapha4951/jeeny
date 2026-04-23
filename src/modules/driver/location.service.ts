import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LocationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Calculate distance between two points using Haversine formula
   * Returns distance in kilometers
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
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

  /**
   * Find nearby drivers within radius using PostgreSQL
   * Much more efficient than Redis for this use case
   */
  async findNearbyDrivers(
    latitude: number,
    longitude: number,
    radiusKm: number,
  ): Promise<string[]> {
    // Use raw SQL for efficient geospatial query
    // This uses PostgreSQL's built-in distance calculation
    const drivers = await this.prisma.$queryRaw<Array<{ userId: string }>>`
      SELECT "userId"
      FROM "Driver"
      WHERE 
        "isOnline" = true
        AND "currentLat" IS NOT NULL
        AND "currentLng" IS NOT NULL
        AND (
          6371 * acos(
            cos(radians(${latitude})) * 
            cos(radians("currentLat")) * 
            cos(radians("currentLng") - radians(${longitude})) + 
            sin(radians(${latitude})) * 
            sin(radians("currentLat"))
          )
        ) <= ${radiusKm}
      ORDER BY (
        6371 * acos(
          cos(radians(${latitude})) * 
          cos(radians("currentLat")) * 
          cos(radians("currentLng") - radians(${longitude})) + 
          sin(radians(${latitude})) * 
          sin(radians("currentLat"))
        )
      ) ASC
    `;

    return drivers.map((d) => d.userId);
  }

  /**
   * Update driver location in database
   */
  async updateDriverLocation(
    userId: string,
    latitude: number,
    longitude: number,
  ): Promise<void> {
    await this.prisma.driver.update({
      where: { userId },
      data: {
        currentLat: latitude,
        currentLng: longitude,
        lastLocationAt: new Date(),
      },
    });
  }

  /**
   * Get driver's current location
   */
  async getDriverLocation(
    userId: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      select: {
        currentLat: true,
        currentLng: true,
      },
    });

    if (!driver || !driver.currentLat || !driver.currentLng) {
      return null;
    }

    return {
      lat: Number(driver.currentLat),
      lng: Number(driver.currentLng),
    };
  }
}
