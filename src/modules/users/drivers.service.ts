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
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      include: {
        user: true,
        vehicles: true,
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
    // Update driver record directly
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    return this.prisma.driver.update({
      where: { userId },
      data: {
        licenseNumber: data.licenseNumber,
        licenseImage: data.licenseUrl,
        nationalIdImage: data.idCardUrl,
        profilePhoto: data.profilePictureUrl,
      },
    });
  }

  async updateOnlineStatus(userId: string, isOnline: boolean) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Update database
    await this.prisma.driver.update({
      where: { userId },
      data: { isOnline },
    });

    // If going offline, remove from Redis geospatial index
    if (!isOnline) {
      await this.redis.getClient().zrem(this.DRIVER_LOCATION_KEY, driver.id);
    }

    return { isOnline };
  }

  async updateLocation(userId: string, latitude: number, longitude: number) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    if (!driver.isOnline) {
      throw new BadRequestException('Driver must be online to update location');
    }

    // Check if location has changed significantly (> 10 meters)
    const lastLocation = await this.redis.geoPos(this.DRIVER_LOCATION_KEY, driver.id);
    
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
    await this.redis.geoAdd(this.DRIVER_LOCATION_KEY, longitude, latitude, driver.id);

    // Update driver's current location in database
    await this.prisma.driver.update({
      where: { id: driver.id },
      data: {
        currentLat: latitude,
        currentLng: longitude,
        lastLocationAt: new Date(),
      },
    });

    // Log location history
    await this.prisma.driverLocation.create({
      data: {
        driverId: driver.id,
        lat: latitude,
        lng: longitude,
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
    const drivers = await this.prisma.driver.findMany({
      where: {
        id: { in: driverIds },
        isOnline: true,
        status: 'APPROVED',
      },
      include: {
        user: true,
        vehicles: true,
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
    const driver = await this.findById(userId);

    const [totalRides, completedRides, cancelledRides] = await Promise.all([
      this.prisma.ride.count({
        where: { driverId: driver.id },
      }),
      this.prisma.ride.count({
        where: { driverId: driver.id, status: 'COMPLETED' },
      }),
      this.prisma.ride.count({
        where: { 
          driverId: driver.id, 
          status: { in: ['CANCELLED_BY_RIDER', 'CANCELLED_BY_DRIVER'] },
        },
      }),
    ]);

    return {
      totalRides,
      completedRides,
      cancelledRides,
      totalEarnings: driver.totalEarnings,
      rating: driver.rating,
      acceptanceRate: 0, // Calculate from ride offers if needed
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
