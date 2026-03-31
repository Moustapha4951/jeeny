import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class DriversService {
  private readonly DRIVER_LOCATION_KEY = 'driver:locations';

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async findById(id: string) {
    const driver = await this.prisma.user.findFirst({
      where: { id, role: 'DRIVER' },
      include: {
        vehicle: true,
        driverProfile: true,
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    return driver;
  }

  async updateDriverProfile(userId: string, data: {
    licenseNumber?: string;
    licenseExpiryDate?: Date;
    licenseUrl?: string;
    idCardUrl?: string;
    profilePictureUrl?: string;
    vehicleRegistrationUrl?: string;
    insuranceUrl?: string;
  }) {
    // Check if driver profile exists
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId },
    });

    if (profile) {
      return this.prisma.driverProfile.update({
        where: { userId },
        data,
      });
    } else {
      return this.prisma.driverProfile.create({
        data: {
          userId,
          ...data,
        },
      });
    }
  }

  async updateOnlineStatus(userId: string, isOnline: boolean) {
    const driver = await this.prisma.user.findFirst({
      where: { id: userId, role: 'DRIVER' },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Update database
    await this.prisma.user.update({
      where: { id: userId },
      data: { isOnline },
    });

    // If going offline, remove from Redis geospatial index
    if (!isOnline) {
      await this.redis.getClient().zrem(this.DRIVER_LOCATION_KEY, userId);
    }

    return { isOnline };
  }

  async updateLocation(userId: string, latitude: number, longitude: number) {
    const driver = await this.prisma.user.findFirst({
      where: { id: userId, role: 'DRIVER' },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    if (!driver.isOnline) {
      throw new BadRequestException('Driver must be online to update location');
    }

    // Check if location has changed significantly (> 10 meters)
    const lastLocation = await this.redis.geoPos(this.DRIVER_LOCATION_KEY, userId);
    
    if (lastLocation) {
      const distance = this.calculateDistance(
        lastLocation[1],
        lastLocation[0],
        latitude,
        longitude,
      );

      if (distance < 10) {
        // Skip update if movement is less than 10 meters
        return { message: 'Location update skipped (minimal movement)' };
      }
    }

    // Update Redis geospatial index
    await this.redis.geoAdd(this.DRIVER_LOCATION_KEY, longitude, latitude, userId);

    // Log location history in database
    await this.prisma.locationHistory.create({
      data: {
        userId,
        latitude,
        longitude,
      },
    });

    return { message: 'Location updated successfully' };
  }

  async getNearbyDrivers(latitude: number, longitude: number, radiusKm: number = 5) {
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
    const drivers = await this.prisma.user.findMany({
      where: {
        id: { in: driverIds },
        role: 'DRIVER',
        isOnline: true,
        status: 'APPROVED',
      },
      include: {
        vehicle: true,
        driverProfile: true,
      },
    });

    // Get current locations from Redis
    const driversWithLocations = await Promise.all(
      drivers.map(async (driver) => {
        const location = await this.redis.geoPos(this.DRIVER_LOCATION_KEY, driver.id);
        return {
          ...driver,
          currentLocation: location
            ? { latitude: location[1], longitude: location[0] }
            : null,
        };
      }),
    );

    return driversWithLocations;
  }

  async getDriverStats(userId: string) {
    const [totalRides, completedRides, cancelledRides, totalEarnings] = await Promise.all([
      this.prisma.ride.count({
        where: { driverId: userId },
      }),
      this.prisma.ride.count({
        where: { driverId: userId, status: 'COMPLETED' },
      }),
      this.prisma.ride.count({
        where: { driverId: userId, status: 'CANCELLED' },
      }),
      this.prisma.ride.aggregate({
        where: { driverId: userId, status: 'COMPLETED' },
        _sum: { driverEarnings: true },
      }),
    ]);

    const driver = await this.findById(userId);

    return {
      totalRides,
      completedRides,
      cancelledRides,
      totalEarnings: totalEarnings._sum.driverEarnings || 0,
      rating: driver.rating,
      acceptanceRate: driver.acceptanceRate,
    };
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }
}
