import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { DriverGateway } from './driver.gateway';
import { UploadDocumentDto, DocumentType } from './dto/upload-document.dto';

@Injectable()
export class DriverService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private driverGateway: DriverGateway,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        driver: {
          include: {
            vehicles: true,
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
      avatar: user.avatar,
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
        currentLat: latitude,
        currentLng: longitude,
        lastLocationAt: new Date(),
      },
    });

    // Update location in Redis for real-time tracking
    if (driver.isOnline) {
      await this.redis.geoAdd(
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
    if (isOnline && driver.currentLat && driver.currentLng) {
      await this.redis.geoAdd(
        'drivers:online',
        Number(driver.currentLng),
        Number(driver.currentLat),
        driver.id,
      );
    } else {
      await this.redis.zRem('drivers:online', driver.id);
    }

    // Emit WebSocket event
    await this.driverGateway.sendDriverUpdate(userId);

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
          in: ['DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'IN_PROGRESS'],
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
          in: ['COMPLETED', 'CANCELLED_BY_RIDER', 'CANCELLED_BY_DRIVER'],
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
        status: 'DRIVER_ASSIGNED',
        driverId: driver.id,
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

    const totalEarnings = rides.reduce((sum, ride) => sum + Number(ride.finalFare || 0), 0);
    const totalRides = rides.length;
    const totalDistance = rides.reduce((sum, ride) => sum + Number(ride.distanceKm || 0), 0);

    return {
      totalEarnings,
      totalRides,
      totalDistance,
      totalHours: 0, // TODO: Calculate from ride durations
    };
  }

  async getWallet(userId: string) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { 
        userId,
        type: 'DRIVER',
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  async uploadDocument(userId: string, uploadDocumentDto: UploadDocumentDto) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const { documentType, fileUrl } = uploadDocumentDto;

    // Map document type to database field
    const driverFieldMap = {
      [DocumentType.LICENSE]: 'licenseImage',
      [DocumentType.NATIONAL_ID]: 'nationalIdImage',
      [DocumentType.PROFILE_PHOTO]: 'profilePhoto',
    };

    const vehicleFieldMap = {
      [DocumentType.VEHICLE_REG]: 'registrationImage',
      [DocumentType.INSURANCE]: 'insuranceImage',
      [DocumentType.VEHICLE_PHOTO]: 'inspectionImage',
    };

    // Update driver document
    if (driverFieldMap[documentType]) {
      await this.prisma.driver.update({
        where: { userId },
        data: {
          [driverFieldMap[documentType]]: fileUrl,
        },
      });
    } else if (vehicleFieldMap[documentType]) {
      // Update vehicle document - get first vehicle or create one
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { driverId: driver.id },
      });

      if (vehicle) {
        await this.prisma.vehicle.update({
          where: { id: vehicle.id },
          data: {
            [vehicleFieldMap[documentType]]: fileUrl,
          },
        });
      }
    }

    return {
      success: true,
      message: 'Document uploaded successfully',
      documentType,
      fileUrl,
    };
  }

  async getDocuments(userId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      select: {
        licenseImage: true,
        nationalIdImage: true,
        profilePhoto: true,
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    return {
      licenseImage: driver.licenseImage,
      nationalIdImage: driver.nationalIdImage,
      profilePhoto: driver.profilePhoto,
    };
  }
}
