import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LocationService } from '../driver/location.service';
import { FirebaseService } from '../../firebase/firebase.service';

interface DriverScore {
  driverId: string;
  score: number;
  distance: number;
}

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);
  private readonly OFFER_EXPIRY = 30; // 30 seconds

  constructor(
    private prisma: PrismaService,
    private locationService: LocationService,
    private firebase: FirebaseService,
  ) {}

  async findAndNotifyDrivers(
    rideId: string,
    pickupLat: number,
    pickupLng: number,
    vehicleTypeId: string,
  ): Promise<void> {
    this.logger.log(`🔍 Finding drivers for ride ${rideId} at (${pickupLat}, ${pickupLng})`);
    
    let radius = 2; // Start with 2km radius
    const maxRadius = 10; // Maximum 10km radius
    let drivers: any[] = [];

    // Expand search radius until we find drivers
    while (drivers.length === 0 && radius <= maxRadius) {
      drivers = await this.findNearbyDrivers(pickupLat, pickupLng, radius, vehicleTypeId);
      
      if (drivers.length === 0) {
        radius += 2; // Expand by 2km
        this.logger.log(`Expanding search radius to ${radius}km for ride ${rideId}`);
      } else {
        this.logger.log(`✅ Found ${drivers.length} drivers within ${radius}km`);
      }
    }

    if (drivers.length === 0) {
      this.logger.warn(`❌ No drivers found within ${maxRadius}km for ride ${rideId}`);
      return;
    }

    // Rank drivers
    const rankedDrivers = this.rankDrivers(drivers, pickupLat, pickupLng);
    this.logger.log(`📊 Ranked ${rankedDrivers.length} drivers`);

    // Create ride offers for top drivers
    await this.createRideOffers(rideId, rankedDrivers.slice(0, 5));

    // Send notifications to drivers
    await this.notifyDrivers(rideId, rankedDrivers.slice(0, 5));
    this.logger.log(`📨 Sent notifications to ${Math.min(rankedDrivers.length, 5)} drivers`);
  }

  private async findNearbyDrivers(
    latitude: number,
    longitude: number,
    radiusKm: number,
    vehicleTypeId: string,
  ): Promise<any[]> {
    this.logger.log(`🔍 Searching for drivers within ${radiusKm}km of (${latitude}, ${longitude})`);
    
    // Get nearby driver IDs from PostgreSQL (no Redis needed!)
    const driverIds = await this.locationService.findNearbyDrivers(
      latitude,
      longitude,
      radiusKm,
    );

    this.logger.log(`📍 Found ${driverIds.length} driver IDs in database`);
    if (driverIds.length > 0) {
      this.logger.log(`   Driver IDs: ${driverIds.join(', ')}`);
    }

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

    this.logger.log(`✅ Found ${drivers.length} eligible drivers (online, approved, with matching vehicle)`);
    
    // Debug: Check all drivers without filters
    const allDrivers = await this.prisma.driver.findMany({
      where: {
        userId: { in: driverIds },
      },
      include: {
        user: true,
        vehicles: true,
      },
    });
    
    for (const driver of allDrivers) {
      this.logger.log(`   Driver ${driver.userId}: online=${driver.isOnline}, status=${driver.status}, vehicles=${driver.vehicles.length}`);
      if (driver.vehicles.length > 0) {
        driver.vehicles.forEach(v => {
          this.logger.log(`      Vehicle: typeId=${v.typeId}, status=${v.status}, isActive=${v.isActive}, requested=${vehicleTypeId}`);
        });
      }
    }

    // Locations are already in the database, no need to fetch from Redis
    const driversWithLocations = drivers.map((driver) => ({
      ...driver,
      currentLocation: driver.currentLat && driver.currentLng
        ? { latitude: Number(driver.currentLat), longitude: Number(driver.currentLng) }
        : null,
    }));

    const validDrivers = driversWithLocations.filter((d) => d.currentLocation !== null);
    this.logger.log(`📍 ${validDrivers.length} drivers have valid locations`);
    
    return validDrivers;
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
