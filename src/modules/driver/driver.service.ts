import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DriverGateway } from './driver.gateway';
import { UploadDocumentDto, DocumentType } from './dto/upload-document.dto';
import { LocationService } from './location.service';

@Injectable()
export class DriverService {
  constructor(
    private prisma: PrismaService,
    private locationService: LocationService,
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

    // Update location in database (no Redis needed)
    await this.locationService.updateDriverLocation(userId, latitude, longitude);
    
    console.log(`✅ Driver ${userId} location updated: (${latitude}, ${longitude})`);

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

    // No Redis needed - location is stored in PostgreSQL
    if (isOnline) {
      console.log(`✅ Driver ${userId} is now online`);
    } else {
      console.log(`❌ Driver ${userId} is now offline`);
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
      include: {
        vehicles: {
          where: { isActive: true, status: 'APPROVED' },
          take: 1,
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const vehicleId = driver.vehicles?.[0]?.id;

    const ride = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'DRIVER_ASSIGNED',
        driverId: driver.id,
        vehicleId: vehicleId,
        acceptedAt: new Date(),
      },
      include: {
        consumer: {
          include: { user: true },
        },
      },
    });

    // Mark driver as on trip so they don't receive new ride notifications
    await this.prisma.driver.update({
      where: { userId },
      data: { isOnTrip: true },
    });

    // Reject other pending offers for this ride
    await this.prisma.rideOffer.updateMany({
      where: { rideId, driverId: { not: driver.id }, status: 'PENDING' },
      data: { status: 'REJECTED' },
    });

    return { success: true, ride };
  }

  async rejectRide(userId: string, rideId: string, reason: string) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (driver) {
      await this.prisma.rideOffer.updateMany({
        where: { rideId, driverId: driver.id, status: 'PENDING' },
        data: { status: 'REJECTED', respondedAt: new Date() },
      });

      // If no more PENDING offers remain, check if ride was targeted to a single driver
      const pendingCount = await this.prisma.rideOffer.count({
        where: { rideId, status: 'PENDING' },
      });

      if (pendingCount === 0) {
        // Count distinct drivers who were ever offered this ride
        const allOffers = await this.prisma.rideOffer.findMany({
          where: { rideId },
          select: { driverId: true },
          distinct: ['driverId'],
        });

        if (allOffers.length <= 1) {
          // Ride was sent to only one driver and they rejected — mark as no drivers found
          await this.prisma.ride
            .update({
              where: { id: rideId },
              data: { status: 'NO_DRIVERS_FOUND' },
            })
            .catch(() => {});
        }
        // If multiple drivers were offered, keep ride as SEARCHING
        // so the admin/system can resend to new drivers
      }
    }
    return { success: true };
  }

  async arrivedAtPickup(userId: string, rideId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Update ride status to DRIVER_ARRIVED
    const ride = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'DRIVER_ARRIVED',
        arrivedAt: new Date(),
      },
      include: {
        consumer: {
          include: { user: true },
        },
      },
    });

    // Log event
    await this.prisma.rideLog.create({
      data: { rideId, event: 'DRIVER_ARRIVED', data: { driverId: driver.id } },
    });

    console.log(`✅ Driver ${driver.id} arrived at pickup for ride ${rideId}`);

    return { success: true, ride };
  }

  async startRide(userId: string, rideId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const ride = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
      include: {
        consumer: {
          include: { user: true },
        },
      },
    });

    // Mark driver as on trip
    await this.prisma.driver.update({
      where: { userId },
      data: { isOnTrip: true },
    });

    // Log event
    await this.prisma.rideLog.create({
      data: { rideId, event: 'STARTED', data: { driverId: driver.id } },
    });

    console.log(`🚗 Ride ${rideId} started by driver ${driver.id}`);

    return { success: true, ride };
  }

  async completeRide(userId: string, rideId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      include: { user: { include: { wallet: true } } },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    const finalFare = Number(ride.finalFare || ride.estimatedFare || 0);

    // Look up vehicle type admin commission
    let adminCommissionPercent = 15; // Default
    if (ride.vehicleTypeId) {
      const vehicleType = await this.prisma.vehicleType.findUnique({
        where: { id: ride.vehicleTypeId },
      });
      if (vehicleType) {
        adminCommissionPercent = Number(vehicleType.adminCommission);
      }
    }

    const driverShare = finalFare * ((100 - adminCommissionPercent) / 100);
    const commissionAmount = finalFare - driverShare;

    // Update ride to COMPLETED
    const updatedRide = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        finalFare: finalFare,
      },
    });

    // Mark driver as no longer on trip
    await this.prisma.driver.update({
      where: { userId },
      data: { isOnTrip: false, totalTrips: { increment: 1 }, totalEarnings: { increment: driverShare } },
    });

    // Credit driver wallet with net amount (after commission)
    if (driver.user.wallet && driverShare > 0) {
      await this.prisma.wallet.update({
        where: { id: driver.user.wallet.id },
        data: { balance: { increment: driverShare } },
      });

      // Create driver earning transaction
      await this.prisma.transaction.create({
        data: {
          walletId: driver.user.wallet.id,
          userId: userId,
          type: 'RIDE_PAYMENT',
          amount: driverShare,
          status: 'COMPLETED',
          rideId: rideId,
          description: `أجرة الرحلة ${ride.rideNumber}`,
          descriptionAr: `أجرة الرحلة ${ride.rideNumber}`,
        },
      });

      // Create commission deduction transaction
      if (commissionAmount > 0) {
        await this.prisma.transaction.create({
          data: {
            walletId: driver.user.wallet.id,
            userId: userId,
            type: 'COMMISSION_DEDUCTION',
            amount: -commissionAmount,
            status: 'COMPLETED',
            rideId: rideId,
            description: `عمولة المنصة (${adminCommissionPercent}%)`,
            descriptionAr: `عمولة المنصة (${adminCommissionPercent}%)`,
          },
        });
      }
    }

    // Log ride completion
    await this.prisma.rideLog.create({
      data: { rideId, event: 'COMPLETED', data: { finalFare, driverShare, commissionAmount, adminCommissionPercent } },
    });

    // Emit WebSocket update to driver
    await this.driverGateway.sendDriverUpdate(userId);

    console.log(`✅ Ride ${rideId} completed by driver ${driver.id}, earned ${driverShare} MRU (commission: ${commissionAmount} MRU at ${adminCommissionPercent}%)`);

    return { success: true, ride: updatedRide, driverShare };
  }

  async cancelRideByDriver(userId: string, rideId: string, reason: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const ride = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'CANCELLED_BY_DRIVER',
        cancelledAt: new Date(),
        cancelledBy: 'DRIVER',
        cancelReason: reason,
      },
    });

    // Mark driver as no longer on trip
    await this.prisma.driver.update({
      where: { userId },
      data: { isOnTrip: false },
    });

    // Log cancellation
    await this.prisma.rideLog.create({
      data: { rideId, event: 'CANCELLED', data: { cancelledBy: 'DRIVER', reason } },
    });

    console.log(`❌ Ride ${rideId} cancelled by driver ${driver.id}: ${reason}`);

    return { success: true, ride };
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

  async registerVehicle(
    userId: string,
    vehicleData: {
      brand: string;
      model: string;
      year: number;
      color: string;
      colorAr: string;
      plateNumber: string;
      registrationNumber: string;
      registrationExpiry: string;
    },
  ) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Check if driver already has a vehicle
    const existingVehicle = await this.prisma.vehicle.findFirst({
      where: { driverId: driver.id },
    });

    if (existingVehicle) {
      throw new BadRequestException('Driver already has a registered vehicle');
    }

    // Create vehicle with PENDING status (admin will assign type and approve)
    const vehicle = await this.prisma.vehicle.create({
      data: {
        driverId: driver.id,
        // typeId is undefined - Admin will assign this based on vehicle info
        brand: vehicleData.brand,
        model: vehicleData.model,
        year: vehicleData.year,
        color: vehicleData.color,
        colorAr: vehicleData.colorAr,
        plateNumber: vehicleData.plateNumber,
        registrationNumber: vehicleData.registrationNumber,
        registrationExpiry: new Date(vehicleData.registrationExpiry),
        status: 'PENDING', // Requires admin approval
        isActive: false,
      },
    });

    console.log(`✅ Vehicle registered for driver ${driver.id}, awaiting admin approval`);

    return {
      success: true,
      message: 'Vehicle registered successfully. Awaiting admin approval.',
      vehicle: {
        id: vehicle.id,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        color: vehicle.color,
        plateNumber: vehicle.plateNumber,
        status: vehicle.status,
      },
    };
  }
}
