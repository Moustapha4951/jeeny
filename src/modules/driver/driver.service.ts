import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
      include: {
        user: {
          include: {
            wallet: true,
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Check if driver is trying to go offline while on a trip
    if (!isOnline && driver.isOnTrip) {
      throw new BadRequestException('Cannot go offline while on a trip');
    }

    // If trying to go online, perform validation checks
    if (isOnline) {
      // 1. Check driver status - must be APPROVED
      if (driver.status !== 'APPROVED') {
        const statusMessages = {
          PENDING: 'Your account is pending approval',
          SUSPENDED: 'Your account has been suspended',
          REJECTED: 'Your account has been rejected',
          INACTIVE: 'Your account is inactive',
        };
        throw new BadRequestException(
          statusMessages[driver.status] || 'Your account is not approved',
        );
      }

      // 2. Check wallet balance against minimum requirement
      const minBalanceSetting = await this.prisma.systemSetting.findUnique({
        where: { key: 'driver_minimum_balance' },
      });

      const minimumBalance = minBalanceSetting 
        ? Number(minBalanceSetting.value) 
        : 0;

      const wallet = driver.user.wallet;
      if (!wallet || Number(wallet.balance) < minimumBalance) {
        throw new BadRequestException(
          `Insufficient balance. Minimum required: ${minimumBalance} MRU`,
        );
      }

      // 3. Check if driver has completed required documents
      const requiredDocs = await this.prisma.document.findMany({
        where: {
          userId,
          type: {
            in: ['LICENSE', 'NATIONAL_ID', 'VEHICLE_REG', 'INSURANCE'],
          },
        },
      });

      const approvedDocs = requiredDocs.filter(doc => doc.status === 'APPROVED');
      if (approvedDocs.length < 4) {
        throw new BadRequestException(
          'Please complete and get approval for all required documents',
        );
      }
    }

    // Update driver online status
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

    const { documentType, fileUrl, expiresAt } = uploadDocumentDto;

    // Map frontend document types to Prisma enum values
    const typeMap: Record<string, string> = {
      [DocumentType.LICENSE]: 'LICENSE',
      [DocumentType.NATIONAL_ID]: 'NATIONAL_ID',
      [DocumentType.PROFILE_PHOTO]: 'PROFILE_PHOTO',
      [DocumentType.VEHICLE_REG]: 'VEHICLE_REG',
      [DocumentType.INSURANCE]: 'INSURANCE',
      [DocumentType.VEHICLE_PHOTO]: 'OTHER', // Map to OTHER since VEHICLE_PHOTO doesn't exist in Prisma
      [DocumentType.CONTRACT]: 'CONTRACT',
    };

    const prismaDocType = typeMap[documentType] || documentType;

    // Check if document already exists
    const existingDoc = await this.prisma.document.findFirst({
      where: {
        userId,
        type: prismaDocType as any,
      },
    });

    // Prevent re-uploading approved documents
    if (existingDoc && existingDoc.status === 'APPROVED') {
      throw new BadRequestException(
        'This document has already been approved and cannot be changed'
      );
    }

    // Only allow re-upload if document is rejected or pending
    if (existingDoc && existingDoc.status === 'PENDING') {
      throw new BadRequestException(
        'This document is currently under review. Please wait for admin decision.'
      );
    }

    let document;
    if (existingDoc) {
      // Update existing document (only if rejected)
      document = await this.prisma.document.update({
        where: { id: existingDoc.id },
        data: {
          url: fileUrl,
          status: 'PENDING',
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          rejectionReason: null,
          reviewedById: null,
          reviewedAt: null,
        },
      });
    } else {
      // Create new document
      document = await this.prisma.document.create({
        data: {
          userId,
          type: prismaDocType as any,
          url: fileUrl,
          status: 'PENDING',
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
      });
    }

    // Also update legacy fields for backward compatibility
    const driverFieldMap: Record<string, string> = {
      [DocumentType.LICENSE]: 'licenseImage',
      [DocumentType.NATIONAL_ID]: 'nationalIdImage',
      [DocumentType.PROFILE_PHOTO]: 'profilePhoto',
    };

    const vehicleFieldMap: Record<string, string> = {
      [DocumentType.VEHICLE_REG]: 'registrationImage',
      [DocumentType.INSURANCE]: 'insuranceImage',
      [DocumentType.VEHICLE_PHOTO]: 'inspectionImage',
    };

    if (driverFieldMap[documentType]) {
      await this.prisma.driver.update({
        where: { userId },
        data: {
          [driverFieldMap[documentType]]: fileUrl,
        },
      });
    } else if (vehicleFieldMap[documentType]) {
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
      document: {
        id: document.id,
        type: document.type,
        url: document.url,
        status: document.status,
        rejectionReason: document.rejectionReason,
        expiresAt: document.expiresAt,
        createdAt: document.createdAt,
        reviewedAt: document.reviewedAt,
      },
    };
  }

  async getDocuments(userId: string) {
    const documents = await this.prisma.document.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        url: true,
        status: true,
        rejectionReason: true,
        expiresAt: true,
        createdAt: true,
        reviewedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { documents };
  }
}
