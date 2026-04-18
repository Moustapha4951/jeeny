import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { FirebaseService } from '../../firebase/firebase.service';

interface DriverScore {
  driverId: string;
  score: number;
  distance: number;
}

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);
  private readonly DRIVER_LOCATION_KEY = 'driver:locations';
  private readonly OFFER_EXPIRY = 30; // 30 seconds

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private firebase: FirebaseService,
  ) {}

  async findAndNotifyDrivers(
    rideId: string,
    pickupLat: number,
    pickupLng: number,
    vehicleTypeId: string,
  ): Promise<void> {
    let radius = 2; // Start with 2km radius
    const maxRadius = 10; // Maximum 10km radius
    let drivers: any[] = [];

    // Expand search radius until we find drivers
    while (drivers.length === 0 && radius <= maxRadius) {
      drivers = await this.findNearbyDrivers(pickupLat, pickupLng, radius, vehicleTypeId);
      
      if (drivers.length === 0) {
        radius += 2; // Expand by 2km
        this.logger.log(`Expanding search radius to ${radius}km for ride ${rideId}`);
      }
    }

    if (drivers.length === 0) {
      this.logger.warn(`No drivers found within ${maxRadius}km for ride ${rideId}`);
      return;
    }

    // Rank drivers
    const rankedDrivers = this.rankDrivers(drivers, pickupLat, pickupLng);

    // Create ride offers for top drivers
    await this.createRideOffers(rideId, rankedDrivers.slice(0, 5));

    // Send notifications to drivers
    await this.notifyDrivers(rideId, rankedDrivers.slice(0, 5));
  }

  private async findNearbyDrivers(
    latitude: number,
    longitude: number,
    radiusKm: number,
    vehicleTypeId: string,
  ): Promise<any[]> {
    // Get nearby driver IDs from Redis
    const driverIds = await this.redis.geoRadius(
      this.DRIVER_LOCATION_KEY,
      longitude,
      latitude,
      radiusKm,
      'km',
    );

    if (driverIds.length === 0) {
      return [];
    }

    // Get driver details from database
    const drivers = await this.prisma.driver.findMany({
      where: {
        userId: { in: driverIds },
        isOnline: true,
        status: 'APPROVED',
        vehicles: {
          some: {
            typeId: vehicleTypeId,
            status: 'APPROVED',
            isActive: true,
          },
        },
      },
      include: {
        user: true,
        vehicles: {
          where: {
            typeId: vehicleTypeId,
            status: 'APPROVED',
            isActive: true,
          },
        },
      },
    });

    // Get current locations from Redis
    const driversWithLocations = await Promise.all(
      drivers.map(async (driver) => {
        const location = await this.redis.geoPos(this.DRIVER_LOCATION_KEY, driver.userId);
        return {
          ...driver,
          currentLocation: location
            ? { latitude: location[1], longitude: location[0] }
            : null,
        };
      }),
    );

    return driversWithLocations.filter((d) => d.currentLocation !== null);
  }

  private rankDrivers(drivers: any[], pickupLat: number, pickupLng: number): DriverScore[] {
    return drivers
      .map((driver) => {
        const distance = this.calculateDistance(
          pickupLat,
          pickupLng,
          driver.currentLocation.latitude,
          driver.currentLocation.longitude,
        );

        // Calculate score based on multiple factors
        const distanceScore = Math.max(0, 100 - distance * 10); // Closer is better
        const ratingScore = (driver.rating || 4.0) * 20; // Rating out of 5, scaled to 100
        const acceptanceScore = (driver.acceptanceRate || 0.8) * 100; // Acceptance rate as percentage

        // Weighted score
        const score = distanceScore * 0.5 + ratingScore * 0.3 + acceptanceScore * 0.2;

        return {
          driverId: driver.id,
          score,
          distance,
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  private async createRideOffers(rideId: string, rankedDrivers: DriverScore[]): Promise<void> {
    const expiresAt = new Date(Date.now() + this.OFFER_EXPIRY * 1000);

    await Promise.all(
      rankedDrivers.map((driver) =>
        this.prisma.rideOffer.create({
          data: {
            rideId,
            driverId: driver.driverId,
            expiresAt,
            status: 'PENDING',
            estimatedArrival: Math.ceil(driver.distance * 2), // Rough estimate: 2 min per km
            distanceToPickup: driver.distance,
          },
        }),
      ),
    );

    // Store offer expiry in Redis for background job
    await this.redis.set(
      `ride:offer:${rideId}`,
      JSON.stringify({ rideId, expiresAt: expiresAt.toISOString() }),
      this.OFFER_EXPIRY,
    );
  }

  private async notifyDrivers(rideId: string, rankedDrivers: DriverScore[]): Promise<void> {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        consumer: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!ride) {
      return;
    }

    await Promise.all(
      rankedDrivers.map(async (driver) => {
        const driverRecord = await this.prisma.driver.findUnique({
          where: { id: driver.driverId },
          include: {
            user: true,
          },
        });

        if (driverRecord?.user?.fcmToken) {
          try {
            await this.firebase.sendNotification(
              driverRecord.user.fcmToken,
              'طلب رحلة جديد',
              `نقطة الانطلاق: ${ride.pickupAddress}`,
              {
                type: 'RIDE_OFFER',
                rideId: ride.id,
                distance: driver.distance.toFixed(2),
                pickupAddress: ride.pickupAddress,
                dropoffAddress: ride.dropoffAddress,
                estimatedFare: ride.estimatedFare.toString(),
              },
            );
          } catch (error) {
            this.logger.error(`Failed to send notification to driver ${driver.driverId}:`, error);
          }
        }
      }),
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
}
