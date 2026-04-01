import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class DriverService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        driver: {
          include: {
            vehicle: true,
          },
        },
        wallet: true,
      },
    });

    if (!user || !user.driver) {
      throw new NotFoundException('Driver profile not found');
    }

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      profilePicture: user.profilePicture,
      driver: user.driver,
      wallet: user.wallet,
      isOnline: user.driver.isOnline,
    };
  }

  async updateLocation(userId: string, latitude: number, longitude: number) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Update location in database
    await this.prisma.driver.update({
      where: { userId },
      data: {
        currentLatitude: latitude,
        currentLongitude: longitude,
        lastLocationUpdate: new Date(),
      },
    });

    // Update location in Redis for real-time tracking
    if (driver.isOnline) {
      await this.redis.geoadd(
        'drivers:online',
        longitude,
        latitude,
        driver.id,
      );
    }

    return { success: true };
  }

  async toggleAvailability(userId: string, isOnline: boolean) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    await this.prisma.driver.update({
      where: { userId },
      data: { isOnline },
    });

    // Update Redis
    if (isOnline && driver.currentLatitude && driver.currentLongitude) {
      await this.redis.geoadd(
        'drivers:online',
        driver.currentLongitude,
        driver.currentLatitude,
        driver.id,
      );
    } else {
      await this.redis.zrem('drivers:online', driver.id);
    }

    return { success: true, isOnline };
  }

  async getActiveRides(userId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const rides = await this.prisma.ride.findMany({
      where: {
        driverId: driver.id,
        status: {
          in: ['PENDING', 'ACCEPTED', 'DRIVER_ARRIVED', 'IN_PROGRESS'],
        },
      },
      include: {
        consumer: {
          include: {
            user: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { rides };
  }

  async getRideHistory(userId: string, page: number, limit: number) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const rides = await this.prisma.ride.findMany({
      where: {
        driverId: driver.id,
        status: {
          in: ['COMPLETED', 'CANCELLED'],
        },
      },
      include: {
        consumer: {
          include: {
            user: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { rides };
  }

  async acceptRide(userId: string, rideId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const ride = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'ACCEPTED',
        driverId: driver.id,
        acceptedAt: new Date(),
      },
    });

    return { success: true, ride };
  }

  async rejectRide(userId: string, rideId: string, reason: string) {
    // Log rejection for analytics
    return { success: true };
  }

  async getEarnings(userId: string, period?: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Calculate earnings based on period
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'daily':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'weekly':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'monthly':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      default:
        startDate = new Date(now.setHours(0, 0, 0, 0));
    }

    const rides = await this.prisma.ride.findMany({
      where: {
        driverId: driver.id,
        status: 'COMPLETED',
        completedAt: {
          gte: startDate,
        },
      },
    });

    const totalEarnings = rides.reduce((sum, ride) => sum + (ride.finalFare || 0), 0);
    const totalRides = rides.length;
    const totalDistance = rides.reduce((sum, ride) => sum + (ride.distance || 0), 0);

    return {
      totalEarnings,
      totalRides,
      totalDistance,
      totalHours: 0, // TODO: Calculate from ride durations
    };
  }

  async getWallet(userId: string) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }
}
