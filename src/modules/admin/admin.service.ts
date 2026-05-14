import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { FirebaseService } from '../../firebase/firebase.service';
import { MatchingService } from '../rides/matching.service';
import { DriverGateway } from '../driver/driver.gateway';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private walletService: WalletService,
    private firebaseService: FirebaseService,
    private matchingService: MatchingService,
    private driverGateway: DriverGateway,
  ) {}

  async getDashboardStats() {
    // Get total drivers
    const totalDrivers = await this.prisma.driver.count();
    
    // Get active (online) drivers
    const activeDrivers = await this.prisma.driver.count({
      where: { isOnline: true },
    });

    // Get total consumers
    const totalConsumers = await this.prisma.consumer.count();

    // Get total rides
    const totalRides = await this.prisma.ride.count();

    // Get completed rides today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const completedRidesToday = await this.prisma.ride.count({
      where: {
        status: 'COMPLETED',
        completedAt: {
          gte: today,
        },
      },
    });

    // Calculate total revenue (sum of completed rides)
    const revenueData = await this.prisma.ride.aggregate({
      where: {
        status: 'COMPLETED',
        finalFare: { not: null },
      },
      _sum: {
        finalFare: true,
      },
    });

    const totalRevenue = revenueData._sum.finalFare || 0;

    return {
      totalDrivers,
      activeDrivers,
      totalConsumers,
      totalRides,
      completedRidesToday,
      totalRevenue: Number(totalRevenue),
    };
  }

  async getAllDrivers() {
    const drivers = await this.prisma.driver.findMany({
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return drivers.map((driver) => ({
      id: driver.id,
      userId: driver.userId,
      phone: driver.user.phone,
      name: `${driver.user.firstName} ${driver.user.lastName}`,
      firstName: driver.user.firstName,
      lastName: driver.user.lastName,
      email: driver.user.email,
      avatar: driver.user.avatar,
      status: driver.status,
      isOnline: driver.isOnline,
      isOnTrip: driver.isOnTrip,
      rating: Number(driver.rating),
      totalTrips: driver.totalTrips,
      licenseNumber: driver.licenseNumber,
      nationalId: driver.nationalId,
      city: driver.city,
      createdAt: driver.createdAt,
      approvedAt: driver.approvedAt,
    }));
  }

  async getDriverById(id: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
          },
        },
        vehicles: true,
      },
    });

    if (!driver) {
      return null;
    }

    return {
      id: driver.id,
      userId: driver.userId,
      phone: driver.user.phone,
      name: `${driver.user.firstName} ${driver.user.lastName}`,
      firstName: driver.user.firstName,
      lastName: driver.user.lastName,
      email: driver.user.email,
      avatar: driver.user.avatar,
      status: driver.status,
      isOnline: driver.isOnline,
      isOnTrip: driver.isOnTrip,
      rating: Number(driver.rating),
      totalTrips: driver.totalTrips,
      totalEarnings: Number(driver.totalEarnings),
      licenseNumber: driver.licenseNumber,
      nationalId: driver.nationalId,
      city: driver.city,
      address: driver.address,
      createdAt: driver.createdAt,
      approvedAt: driver.approvedAt,
      vehicles: driver.vehicles,
    };
  }

  async approveDriver(id: string) {
    const driver = await this.prisma.driver.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
      },
      include: {
        user: true,
      },
    });

    return {
      success: true,
      message: 'تم الموافقة على السائق بنجاح',
      driver,
    };
  }

  async rejectDriver(id: string, reason: string) {
    const driver = await this.prisma.driver.update({
      where: { id },
      data: {
        status: 'REJECTED',
      },
      include: {
        user: true,
      },
    });

    return {
      success: true,
      message: 'تم رفض السائق',
      driver,
    };
  }

  async suspendDriver(id: string, reason: string) {
    const driver = await this.prisma.driver.update({
      where: { id },
      data: {
        status: 'SUSPENDED',
        isOnline: false,
      },
      include: {
        user: true,
      },
    });

    return {
      success: true,
      message: 'تم تعليق السائق',
      driver,
    };
  }

  async getAllRides() {
    const rides = await this.prisma.ride.findMany({
      include: {
        consumer: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
          },
        },
        driver: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    return rides.map((ride) => {
      const consumerName = `${ride.consumer.user.firstName || ''} ${ride.consumer.user.lastName || ''}`.trim() || 'راكب';
      const driverName = ride.driver
        ? `${ride.driver.user.firstName || ''} ${ride.driver.user.lastName || ''}`.trim() || 'سائق'
        : 'غير محدد';
      
      return {
        id: ride.id,
        rideNumber: this.generateReadableRideNumber(ride.id, ride.createdAt),
        passenger: consumerName,
        driver: driverName,
        status: this.translateStatus(ride.status),
        fare: Number(ride.finalFare || ride.estimatedFare).toFixed(0),
        pickupAddress: ride.pickupAddress,
        dropoffAddress: ride.dropoffAddress,
        createdAt: ride.createdAt,
        completedAt: ride.completedAt,
      };
    });
  }

  async getRideById(id: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id },
      include: {
        consumer: {
          include: {
            user: {
              select: {
                id: true,
                phone: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
        },
        driver: {
          include: {
            user: {
              select: {
                id: true,
                phone: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
            vehicles: true,
          },
        },
        vehicleType: true,
        vehicle: true,
      },
    });

    if (!ride) {
      return null;
    }

    // Format response
    return {
      id: ride.id,
      rideNumber: this.generateReadableRideNumber(ride.id, ride.createdAt),
      status: ride.status,
      statusArabic: this.translateStatus(ride.status),
      bookingSource: ride.bookingSource,
      paymentMethod: ride.paymentMethod,
      paymentStatus: ride.paymentStatus,
      
      // Consumer info
      consumer: {
        id: ride.consumer.id,
        name: `${ride.consumer.user.firstName || ''} ${ride.consumer.user.lastName || ''}`.trim() || 'عميل',
        phone: ride.consumer.user.phone,
        avatar: ride.consumer.user.avatar,
      },
      
      // Driver info
      driver: ride.driver ? {
        id: ride.driver.id,
        name: `${ride.driver.user.firstName || ''} ${ride.driver.user.lastName || ''}`.trim() || 'سائق',
        phone: ride.driver.user.phone,
        avatar: ride.driver.user.avatar,
        rating: Number(ride.driver.rating),
        totalTrips: ride.driver.totalTrips,
      } : null,
      
      // Vehicle info
      vehicle: ride.vehicle ? {
        brand: ride.vehicle.brand,
        model: ride.vehicle.model,
        year: ride.vehicle.year,
        color: ride.vehicle.color,
        plateNumber: ride.vehicle.plateNumber,
      } : null,
      
      // Location info
      pickup: {
        address: ride.pickupAddress,
        latitude: Number(ride.pickupLat),
        longitude: Number(ride.pickupLng),
      },
      dropoff: {
        address: ride.dropoffAddress,
        latitude: Number(ride.dropoffLat),
        longitude: Number(ride.dropoffLng),
      },
      
      // Trip details
      distanceKm: Number(ride.distanceKm),
      durationMin: ride.durationMin,
      estimatedFare: Number(ride.estimatedFare),
      finalFare: ride.finalFare ? Number(ride.finalFare) : null,
      discount: Number(ride.discount),
      surgeMultiplier: Number(ride.surgeMultiplier),
      
      // Vehicle type
      vehicleType: ride.vehicleType ? {
        id: ride.vehicleType.id,
        name: ride.vehicleType.name,
        nameAr: ride.vehicleType.nameAr,
      } : null,
      
      // Timestamps
      requestedAt: ride.requestedAt,
      acceptedAt: ride.acceptedAt,
      arrivedAt: ride.arrivedAt,
      startedAt: ride.startedAt,
      completedAt: ride.completedAt,
      cancelledAt: ride.cancelledAt,
      
      // Additional info
      cancelReason: ride.cancelReason,
      cancelledBy: ride.cancelledBy,
      riderNotes: ride.riderNotes,
      driverNotes: ride.driverNotes,
    };
  }

  private translateStatus(status: string): string {
    const statusMap: Record<string, string> = {
      PENDING: 'قيد الانتظار',
      SEARCHING: 'جاري البحث',
      DRIVER_ASSIGNED: 'تم تعيين السائق',
      DRIVER_ARRIVED: 'وصل السائق',
      IN_PROGRESS: 'جارية',
      COMPLETED: 'مكتملة',
      CANCELLED_BY_RIDER: 'ملغاة',
      CANCELLED_BY_DRIVER: 'ملغاة',
      NO_DRIVERS_FOUND: 'لم يتم العثور على سائقين',
    };

    return statusMap[status] || status;
  }

  private generateReadableRideNumber(rideId: string, createdAt: Date): string {
    // Generate a readable ride number like: JNY-20250101-1234
    const date = createdAt.toISOString().slice(0, 10).replace(/-/g, '');
    const shortId = rideId.slice(0, 8).toUpperCase();
    return `JNY-${date}-${shortId}`;
  }

  async checkCustomerByPhone(phone: string) {
    const consumer = await this.prisma.consumer.findFirst({
      where: {
        user: {
          phone: phone,
        },
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (consumer) {
      return {
        exists: true,
        id: consumer.id,
        name: `${consumer.user.firstName || ''} ${consumer.user.lastName || ''}`.trim(),
      };
    }

    return { exists: false };
  }

  async getVehicleTypes() {
    const vehicleTypes = await this.prisma.vehicleType.findMany({
      orderBy: {
        basePrice: 'asc',
      },
    });

    return vehicleTypes;
  }

  async validateBookingConfiguration() {
    const errors: string[] = [];

    // Check vehicle types exist
    const vehicleTypes = await this.prisma.vehicleType.findMany({
      where: { isActive: true },
    });
    if (vehicleTypes.length === 0) {
      errors.push('لا توجد أنواع مركبات مفعلة. يرجى من المشرف إضافة أنواع المركبات');
    }

    // Check required system settings
    const requiredSettings = [
      { key: 'matching_radius_km', label: 'نطاق البحث عن السائقين (كم)' },
      { key: 'commission_rate_percent', label: 'نسبة عمولة المنصة' },
      { key: 'min_driver_rating', label: 'الحد الأدنى لتقييم السائق' },
      { key: 'ride_offer_expiry_seconds', label: 'مدة صلاحية عرض الرحلة' },
    ];

    const existingSettings = await this.prisma.systemSetting.findMany({
      where: { key: { in: requiredSettings.map(s => s.key) } },
    });
    const existingKeys = new Set(existingSettings.map(s => s.key));

    for (const setting of requiredSettings) {
      if (!existingKeys.has(setting.key)) {
        errors.push(`الإعداد "${setting.label}" غير مضبوط. يرجى من المشرف ضبط الإعدادات`);
      }
    }

    // Check at least one approved online driver exists
    const onlineDrivers = await this.prisma.driver.count({
      where: {
        isOnline: true,
        status: 'APPROVED',
        vehicles: { some: { status: 'APPROVED', isActive: true } },
      },
    });
    if (onlineDrivers === 0) {
      errors.push('لا يوجد سائقون متاحون حالياً. يرجى التأكد من وجود سائقين نشطين');
    }

    return {
      valid: errors.length === 0,
      errors,
      vehicleTypes,
    };
  }

  async bookRideForCustomer(bookingData: any) {
    // Validate configuration before proceeding
    const configValidation = await this.validateBookingConfiguration();
    if (!configValidation.valid) {
      return {
        success: false,
        message: 'تعذر إنشاء الرحلة بسبب مشاكل في الإعدادات',
        errors: configValidation.errors,
        requiresAdminAction: true,
      };
    }

    const {
      customerPhone,
      customerName,
      pickupAddress,
      dropoffAddress,
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng,
      manualFare,
      vehicleTypeId,
      distanceKm: reqDistanceKm,
      durationMin: reqDurationMin,
      companyId,
      strategy,
      targetDriverIds,
    } = bookingData;

    console.log('Booking data received:', { customerPhone, customerName });

    // Find or create consumer by phone number
    let consumer = await this.prisma.consumer.findFirst({
      where: {
        user: {
          phone: customerPhone,
        },
      },
      include: {
        user: true,
      },
    });

    console.log('Consumer found:', consumer ? 'Yes' : 'No');

    // If consumer doesn't exist, create one
    if (!consumer) {
      // Split customer name into first and last name
      const fullName = (customerName || 'عميل').trim();
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0] || 'عميل';
      // Only use remaining parts as lastName if they exist, otherwise use empty string
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
      
      console.log('Creating new user with:', { firstName, lastName, phone: customerPhone });
      
      const user = await this.prisma.user.create({
        data: {
          phone: customerPhone,
          phoneVerified: true,
          firstName: firstName,
          lastName: lastName,
        },
      });

      console.log('User created:', user.id);

      consumer = await this.prisma.consumer.create({
        data: {
          userId: user.id,
        },
        include: {
          user: true,
        },
      });

      // Create wallet for new consumer
      await this.prisma.wallet.create({
        data: {
          userId: user.id,
          type: 'CONSUMER',
          balance: 0,
        },
      });
    }

    // Use vehicle type from validated config - default to cheapest
    const availableTypes = configValidation.vehicleTypes;
    let selectedVehicleTypeId = vehicleTypeId;
    if (!selectedVehicleTypeId || !availableTypes.some(vt => vt.id === selectedVehicleTypeId)) {
      // Sort by basePrice ascending and pick cheapest
      availableTypes.sort((a, b) => Number(a.basePrice) - Number(b.basePrice));
      selectedVehicleTypeId = availableTypes[0]?.id;
    }

    if (!selectedVehicleTypeId) {
      return {
        success: false,
        message: 'لا يوجد نوع مركبة متاح',
      };
    }

    let distanceKm = reqDistanceKm;
    let durationMin = reqDurationMin;

    if (!distanceKm || !durationMin) {
      // Calculate distance (simple Haversine formula)
      const R = 6371; // Earth radius in km
      const dLat = ((dropoffLat - pickupLat) * Math.PI) / 180;
      const dLon = ((dropoffLng - pickupLng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((pickupLat * Math.PI) / 180) *
          Math.cos((dropoffLat * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      distanceKm = R * c;

      // Estimate duration (assuming 30 km/h average speed)
      durationMin = Math.ceil((distanceKm / 30) * 60);
    }

    // Calculate fare or use manual fare
    let estimatedFare = manualFare;
    if (!estimatedFare) {
      const vehicleType = await this.prisma.vehicleType.findUnique({
        where: { id: selectedVehicleTypeId },
      });
      
      if (vehicleType) {
        estimatedFare =
          Number(vehicleType.basePrice) +
          Number(vehicleType.pricePerKm) * distanceKm +
          Number(vehicleType.pricePerMin) * durationMin;
        
        // Apply minimum fare
        if (estimatedFare < Number(vehicleType.minFare)) {
          estimatedFare = Number(vehicleType.minFare);
        }
      } else {
        estimatedFare = 100; // Default fallback
      }
    }

    // Create ride
    const ride = await this.prisma.ride.create({
      data: {
        consumerId: consumer.id,
        companyId,
        vehicleTypeId: selectedVehicleTypeId,
        pickupLat,
        pickupLng,
        pickupAddress,
        dropoffLat,
        dropoffLng,
        dropoffAddress,
        distanceKm,
        durationMin,
        estimatedFare,
        finalFare: manualFare || null,
        status: 'SEARCHING',
        bookingSource: 'CALL_CENTER',
        paymentMethod: 'CASH',
      },
    });

    // Fetch company configuration if present
    let maxRadiusKm: number | undefined;
    let expansionKm: number | undefined;

    if (companyId) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId } });
      if (company && company.canConfigureDispatch) {
        maxRadiusKm = Number(company.dispatchRadiusKm);
        expansionKm = Number(company.resendExpansionKm);
      }
    }

    // Find and notify nearby drivers (don't wait for completion)
    this.matchingService.findAndNotifyDrivers(
      ride.id,
      pickupLat,
      pickupLng,
      selectedVehicleTypeId,
      {
        maxRadiusKm,
        expansionKm,
        strategy,
        targetDriverIds,
      }
    ).catch((error) => {
      console.error('Error finding and notifying drivers:', error);
    });

    return {
      success: true,
      message: 'تم إنشاء الرحلة بنجاح',
      ride: {
        id: ride.id,
        rideNumber: ride.rideNumber,
        estimatedFare: Number(ride.estimatedFare),
        distanceKm: Number(ride.distanceKm),
        durationMin: ride.durationMin,
      },
    };
  }

  async estimateFare(estimateData: any) {
    const { pickupLat, pickupLng, dropoffLat, dropoffLng, distanceKm, durationMin, vehicleTypeId } = estimateData;

    let calculatedDistanceKm = distanceKm;
    let calculatedDurationMin = durationMin;

    // If distance/duration not provided, calculate using Haversine
    if (!calculatedDistanceKm || !calculatedDurationMin) {
      const R = 6371; // Earth radius in km
      const dLat = ((dropoffLat - pickupLat) * Math.PI) / 180;
      const dLon = ((dropoffLng - pickupLng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((pickupLat * Math.PI) / 180) *
          Math.cos((dropoffLat * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      calculatedDistanceKm = R * c;
      calculatedDurationMin = Math.ceil((calculatedDistanceKm / 30) * 60);
    }

    // Use specific vehicle type if provided, otherwise cheapest
    let vehicleType;
    if (vehicleTypeId) {
      vehicleType = await this.prisma.vehicleType.findUnique({
        where: { id: vehicleTypeId },
      });
    }
    if (!vehicleType) {
      vehicleType = await this.prisma.vehicleType.findFirst({
        where: { isActive: true },
        orderBy: { basePrice: 'asc' },
      });
    }

    let estimatedFare = 100; // Default fallback
    if (vehicleType) {
      estimatedFare =
        Number(vehicleType.basePrice) +
        Number(vehicleType.pricePerKm) * calculatedDistanceKm +
        Number(vehicleType.pricePerMin) * calculatedDurationMin;

      if (estimatedFare < Number(vehicleType.minFare)) {
        estimatedFare = Number(vehicleType.minFare);
      }
    }

    // Also return all vehicle types with their prices so the app can display them
    const allTypes = await this.prisma.vehicleType.findMany({ where: { isActive: true } });
    const typePricing = allTypes.map(vt => ({
      id: vt.id,
      name: vt.name,
      nameAr: vt.nameAr,
      nameFr: vt.nameFr,
      icon: vt.icon,
      basePrice: Number(vt.basePrice),
      pricePerKm: Number(vt.pricePerKm),
      pricePerMin: Number(vt.pricePerMin),
      minFare: Number(vt.minFare),
      capacity: vt.capacity,
      estimatedFare: 
        Number(vt.basePrice) +
        Number(vt.pricePerKm) * calculatedDistanceKm +
        Number(vt.pricePerMin) * calculatedDurationMin >= Number(vt.minFare)
          ? Number(Number(vt.basePrice) +
              Number(vt.pricePerKm) * calculatedDistanceKm +
              Number(vt.pricePerMin) * calculatedDurationMin)
          : Number(vt.minFare),
    }));

    return {
      estimatedFare: Number(estimatedFare.toFixed(0)),
      distanceKm: Number(calculatedDistanceKm.toFixed(2)),
      durationMin: calculatedDurationMin,
      vehicleType: vehicleType ? { id: vehicleType.id, name: vehicleType.name, nameAr: vehicleType.nameAr } : null,
      vehicleTypes: typePricing,
    };
  }

  async releaseDriver(driverId: string) {
    try {
      await this.prisma.driver.update({
        where: { id: driverId },
        data: { isOnTrip: false },
      });
      return { success: true, message: 'تم تحرير السائق بنجاح' };
    } catch (e) {
      return { success: false, message: 'السائق غير موجود' };
    }
  }

  async cancelRide(id: string, reason?: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id },
    });

    if (!ride) {
      return {
        success: false,
        message: 'الرحلة غير موجودة',
      };
    }

    if (ride.status === 'COMPLETED' || ride.status === 'CANCELLED_BY_RIDER' || ride.status === 'CANCELLED_BY_DRIVER') {
      return {
        success: false,
        message: 'لا يمكن إلغاء هذه الرحلة',
      };
    }

    const updatedRide = await this.prisma.ride.update({
      where: { id },
      data: {
        status: 'CANCELLED_BY_RIDER', // Using CANCELLED_BY_RIDER for admin cancellations
        cancelledAt: new Date(),
        cancelReason: reason || 'تم الإلغاء من قبل الإدارة',
        cancelledBy: 'ADMIN',
      },
    });

    // Release the driver if one was assigned
    if (ride.driverId) {
      await this.prisma.driver.update({
        where: { id: ride.driverId },
        data: { isOnTrip: false },
      }).catch(() => {});

      // Notify driver via WebSocket that the ride was cancelled
      this.driverGateway.sendRideUpdate(ride.driverId, { ...updatedRide, status: 'CANCELLED_BY_RIDER' }).catch(() => {});
    }

    return {
      success: true,
      message: 'تم إلغاء الرحلة بنجاح',
    };
  }

  async resendRide(id: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id },
    });

    if (!ride) {
      return { success: false, message: 'الرحلة غير موجودة' };
    }

    // Only allow resending rides that failed or were cancelled
    const resendableStatuses = ['NO_DRIVERS_FOUND', 'CANCELLED_BY_RIDER', 'CANCELLED_BY_DRIVER', 'SEARCHING'];
    if (!resendableStatuses.includes(ride.status)) {
      return { success: false, message: 'لا يمكن إعادة إرسال هذه الرحلة' };
    }

    // Release the old driver if there was one
    if (ride.driverId) {
      await this.prisma.driver.update({
        where: { id: ride.driverId },
        data: { isOnTrip: false },
      }).catch(() => {});
    }

    // Reset ride status to SEARCHING
    await this.prisma.ride.update({
      where: { id },
      data: {
        status: 'SEARCHING',
        driverId: null,
        vehicleId: null,
        acceptedAt: null,
        cancelledAt: null,
        cancelReason: null,
        cancelledBy: null,
      },
    });

    // Fetch company configuration if present
    let maxRadiusKm: number | undefined;
    let expansionKm: number | undefined;

    if (ride.companyId) {
      const company = await this.prisma.company.findUnique({ where: { id: ride.companyId } });
      if (company && company.canConfigureDispatch) {
        maxRadiusKm = Number(company.dispatchRadiusKm);
        expansionKm = Number(company.resendExpansionKm);
      }
    }

    // Re-trigger matching (rejected drivers will be automatically excluded)
    this.matchingService.findAndNotifyDrivers(
      ride.id,
      Number(ride.pickupLat),
      Number(ride.pickupLng),
      ride.vehicleTypeId,
      { maxRadiusKm, expansionKm }
    ).catch((error) => {
      console.error('Error resending ride to drivers:', error);
    });

    return {
      success: true,
      message: 'تم إعادة إرسال الرحلة بنجاح',
    };
  }

  async createVehicleType(data: any) {
    const vehicleType = await this.prisma.vehicleType.create({
      data: {
        name: data.name,
        nameAr: data.nameAr,
        nameFr: data.nameFr || data.name,
        description: data.description,
        image: data.image,
        basePrice: data.basePrice,
        pricePerKm: data.pricePerKm,
        pricePerMin: data.pricePerMin,
        minFare: data.minFare,
        nightPriceMultiplier: data.nightPriceMultiplier || 1.0,
        adminCommission: data.adminCommission || 15.0,
        driverCommission: data.driverCommission || 85.0,
        cancellationFee: data.cancellationFee || 0,
        capacity: data.capacity || 4,
        icon: data.icon || 'car',
        isActive: data.isActive !== undefined ? data.isActive : true,
        supportsIntercity: data.supportsIntercity || false,
      },
    });

    return {
      success: true,
      message: 'تم إضافة نوع المركبة بنجاح',
      vehicleType,
    };
  }

  async updateVehicleType(id: string, data: any) {
    const vehicleType = await this.prisma.vehicleType.findUnique({
      where: { id },
    });

    if (!vehicleType) {
      return {
        success: false,
        message: 'نوع المركبة غير موجود',
      };
    }

    const updated = await this.prisma.vehicleType.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name : vehicleType.name,
        nameAr: data.nameAr !== undefined ? data.nameAr : vehicleType.nameAr,
        nameFr: data.nameFr !== undefined ? data.nameFr : vehicleType.nameFr,
        description: data.description !== undefined ? data.description : vehicleType.description,
        image: data.image !== undefined ? data.image : vehicleType.image,
        basePrice: data.basePrice !== undefined ? data.basePrice : vehicleType.basePrice,
        pricePerKm: data.pricePerKm !== undefined ? data.pricePerKm : vehicleType.pricePerKm,
        pricePerMin: data.pricePerMin !== undefined ? data.pricePerMin : vehicleType.pricePerMin,
        minFare: data.minFare !== undefined ? data.minFare : vehicleType.minFare,
        nightPriceMultiplier: data.nightPriceMultiplier !== undefined ? data.nightPriceMultiplier : vehicleType.nightPriceMultiplier,
        adminCommission: data.adminCommission !== undefined ? data.adminCommission : vehicleType.adminCommission,
        driverCommission: data.driverCommission !== undefined ? data.driverCommission : vehicleType.driverCommission,
        cancellationFee: data.cancellationFee !== undefined ? data.cancellationFee : vehicleType.cancellationFee,
        capacity: data.capacity !== undefined ? data.capacity : vehicleType.capacity,
        icon: data.icon !== undefined ? data.icon : vehicleType.icon,
        isActive: data.isActive !== undefined ? data.isActive : vehicleType.isActive,
        supportsIntercity: data.supportsIntercity !== undefined ? data.supportsIntercity : vehicleType.supportsIntercity,
      },
    });

    return {
      success: true,
      message: 'تم تحديث نوع المركبة بنجاح',
      vehicleType: updated,
    };
  }

  async getSystemSettings() {
    const settings = await this.prisma.systemSetting.findMany({
      orderBy: {
        category: 'asc',
      },
    });

    // Group settings by category
    const grouped = settings.reduce((acc, setting) => {
      if (!acc[setting.category]) {
        acc[setting.category] = [];
      }
      acc[setting.category].push({
        key: setting.key,
        value: setting.value,
        valueType: setting.valueType,
        descriptionAr: setting.descriptionAr,
        descriptionEn: setting.descriptionEn,
        updatedAt: setting.updatedAt,
      });
      return acc;
    }, {} as Record<string, any[]>);

    return grouped;
  }

  async updateSystemSetting(key: string, data: any) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key },
    });

    if (!setting) {
      // Create new setting if it doesn't exist
      const newSetting = await this.prisma.systemSetting.create({
        data: {
          key,
          value: data.value,
          valueType: data.valueType || 'STRING',
          category: data.category || 'GENERAL',
          descriptionAr: data.descriptionAr,
          descriptionEn: data.descriptionEn,
          isPublic: data.isPublic || false,
        },
      });

      return {
        success: true,
        message: 'تم إنشاء الإعداد بنجاح',
        setting: newSetting,
      };
    }

    const updated = await this.prisma.systemSetting.update({
      where: { key },
      data: {
        value: data.value !== undefined ? data.value : setting.value,
        valueType: data.valueType !== undefined ? data.valueType : setting.valueType,
        descriptionAr: data.descriptionAr !== undefined ? data.descriptionAr : setting.descriptionAr,
        descriptionEn: data.descriptionEn !== undefined ? data.descriptionEn : setting.descriptionEn,
      },
    });

    return {
      success: true,
      message: 'تم تحديث الإعداد بنجاح',
      setting: updated,
    };
  }

  // ===== Zones Management =====
  async getZones() {
    try {
      const zones = await this.prisma.zone.findMany({
        include: {
          city: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return zones;
    } catch (error) {
      console.error('Error fetching zones:', error);
      throw new Error('فشل في تحميل المناطق');
    }
  }

  async getZone(id: string) {
    const zone = await this.prisma.zone.findUnique({
      where: { id },
      include: {
        city: true,
      },
    });

    if (!zone) {
      throw new Error('المنطقة غير موجودة');
    }

    return zone;
  }

  async createZone(data: any) {
    const zone = await this.prisma.zone.create({
      data: {
        name: data.name,
        nameAr: data.nameAr,
        nameFr: data.nameFr || data.name,
        type: data.type,
        polygon: data.polygon,
        center: data.center,
        isActive: data.isActive !== undefined ? data.isActive : true,
        surgeMultiplier: data.surgeMultiplier || 1.0,
        restrictions: data.restrictions || null,
        cityId: data.cityId || null,
      },
      include: {
        city: true,
      },
    });

    return {
      success: true,
      message: 'تم إنشاء المنطقة بنجاح',
      zone,
    };
  }

  async updateZone(id: string, data: any) {
    const zone = await this.prisma.zone.findUnique({
      where: { id },
    });

    if (!zone) {
      throw new Error('المنطقة غير موجودة');
    }

    const updated = await this.prisma.zone.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name : zone.name,
        nameAr: data.nameAr !== undefined ? data.nameAr : zone.nameAr,
        nameFr: data.nameFr !== undefined ? data.nameFr : zone.nameFr,
        type: data.type !== undefined ? data.type : zone.type,
        polygon: data.polygon !== undefined ? data.polygon : zone.polygon,
        center: data.center !== undefined ? data.center : zone.center,
        isActive: data.isActive !== undefined ? data.isActive : zone.isActive,
        surgeMultiplier: data.surgeMultiplier !== undefined ? data.surgeMultiplier : zone.surgeMultiplier,
        restrictions: data.restrictions !== undefined ? data.restrictions : zone.restrictions,
        cityId: data.cityId !== undefined ? data.cityId : zone.cityId,
      },
      include: {
        city: true,
      },
    });

    return {
      success: true,
      message: 'تم تحديث المنطقة بنجاح',
      zone: updated,
    };
  }

  async deleteZone(id: string) {
    const zone = await this.prisma.zone.findUnique({
      where: { id },
    });

    if (!zone) {
      throw new Error('المنطقة غير موجودة');
    }

    await this.prisma.zone.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'تم حذف المنطقة بنجاح',
    };
  }

  async toggleZone(id: string) {
    const zone = await this.prisma.zone.findUnique({
      where: { id },
    });

    if (!zone) {
      throw new Error('المنطقة غير موجودة');
    }

    const updated = await this.prisma.zone.update({
      where: { id },
      data: {
        isActive: !zone.isActive,
      },
    });

    return {
      success: true,
      message: zone.isActive ? 'تم تعطيل المنطقة' : 'تم تفعيل المنطقة',
      zone: updated,
    };
  }

  async creditDriverWallet(driverId: string, amount: number, description: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        user: true,
      },
    });

    if (!driver) {
      throw new Error('Driver not found');
    }

    // Use WalletService to trigger WebSocket event
    await this.walletService.creditBalance(
      driver.userId,
      amount,
      description || 'Admin credit',
    );

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: driver.userId },
    });

    // Send FCM notification
    if (driver.user.fcmToken) {
      console.log(`📱 Sending FCM notification to driver ${driver.id}, token: ${driver.user.fcmToken.substring(0, 20)}...`);
      try {
        const result = await this.firebaseService.sendNotification(
          driver.user.fcmToken,
          'تم إضافة رصيد',
          `تم إضافة ${amount} أوقية إلى محفظتك. ${description}`,
          {
            type: 'wallet_credit',
            amount: amount.toString(),
            balance: wallet?.balance.toString() || '0',
          },
        );
        console.log(`✅ FCM notification sent successfully: ${result}`);
      } catch (error) {
        console.error('❌ Failed to send FCM notification:', error);
      }
    } else {
      console.log(`⚠️ No FCM token for driver ${driver.id}`);
    }

    return {
      success: true,
      message: 'تم إضافة الرصيد بنجاح',
      balance: wallet?.balance,
    };
  }

  async debitDriverWallet(driverId: string, amount: number, description: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      throw new Error('Driver not found');
    }

    // Use WalletService to trigger WebSocket event
    await this.walletService.debitBalance(
      driver.userId,
      amount,
      description || 'Admin debit',
    );

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: driver.userId },
    });

    return {
      success: true,
      message: 'تم خصم الرصيد بنجاح',
      balance: wallet?.balance,
    };
  }

  async getDriverDocuments(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const documents = await this.prisma.document.findMany({
      where: { userId: driver.userId },
      orderBy: { createdAt: 'desc' },
    });

    return { documents };
  }

  async approveDocument(documentId: string, adminId: string) {
    const document = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'APPROVED',
        rejectionReason: null,
        reviewedAt: new Date(),
        // reviewedById is optional - not setting it since we don't have Employee auth yet
      },
      include: {
        user: true,
      },
    });

    // If profile photo is approved, update user avatar
    if (document.type === 'PROFILE_PHOTO') {
      await this.prisma.user.update({
        where: { id: document.userId },
        data: { avatar: document.url },
      });
    }

    // Send FCM notification
    if (document.user.fcmToken) {
      const docTypeArabic = {
        'LICENSE': 'رخصة القيادة',
        'NATIONAL_ID': 'البطاقة الوطنية',
        'VEHICLE_REG': 'استمارة المركبة',
        'INSURANCE': 'تأمين المركبة',
        'PROFILE_PHOTO': 'الصورة الشخصية',
        'OTHER': 'صورة المركبة',
        'CONTRACT': 'العقد',
      };

      await this.firebaseService.sendNotification(
        document.user.fcmToken,
        'تمت الموافقة على المستند ✓',
        `تمت الموافقة على ${docTypeArabic[document.type] || document.type}`,
        { type: 'DOCUMENT_APPROVED', documentId: document.id, documentType: document.type },
      );
    }

    // Check if all required documents are approved
    const allDocs = await this.prisma.document.findMany({
      where: { userId: document.userId },
    });

    const requiredTypes = ['LICENSE', 'NATIONAL_ID', 'VEHICLE_REG', 'INSURANCE'];
    const approvedRequired = allDocs.filter(
      doc => requiredTypes.includes(doc.type) && doc.status === 'APPROVED'
    );

    // If all 4 required documents are approved, approve the driver
    if (approvedRequired.length === 4) {
      await this.prisma.driver.update({
        where: { userId: document.userId },
        data: { status: 'APPROVED' },
      });

      // Send congratulations notification
      if (document.user.fcmToken) {
        await this.firebaseService.sendNotification(
          document.user.fcmToken,
          'مبروك! تم قبولك كسائق 🎉',
          'تمت الموافقة على جميع مستنداتك. يمكنك الآن البدء في العمل',
          { type: 'DRIVER_APPROVED' },
        );
      }
    }

    return { success: true, document };
  }

  async rejectDocument(documentId: string, adminId: string, reason: string) {
    const document = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'REJECTED',
        rejectionReason: reason,
        reviewedAt: new Date(),
        // reviewedById is optional - not setting it since we don't have Employee auth yet
      },
      include: {
        user: true,
      },
    });

    // Send FCM notification
    if (document.user.fcmToken) {
      const docTypeArabic = {
        'LICENSE': 'رخصة القيادة',
        'NATIONAL_ID': 'البطاقة الوطنية',
        'VEHICLE_REG': 'استمارة المركبة',
        'INSURANCE': 'تأمين المركبة',
        'PROFILE_PHOTO': 'الصورة الشخصية',
        'OTHER': 'صورة المركبة',
        'CONTRACT': 'العقد',
      };

      await this.firebaseService.sendNotification(
        document.user.fcmToken,
        'تم رفض المستند',
        `تم رفض ${docTypeArabic[document.type] || document.type}. السبب: ${reason}`,
        { type: 'DOCUMENT_REJECTED', documentId: document.id, documentType: document.type, reason },
      );
    }

    // If any required document is rejected, set driver status to PENDING
    const requiredTypes = ['LICENSE', 'NATIONAL_ID', 'VEHICLE_REG', 'INSURANCE'];
    if (requiredTypes.includes(document.type)) {
      await this.prisma.driver.update({
        where: { userId: document.userId },
        data: { status: 'PENDING' },
      });
    }

    return { success: true, document };
  }

  async getDriverVehicles(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        vehicles: {
          include: {
            type: true,
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    return { vehicles: driver.vehicles };
  }

  async approveVehicle(vehicleId: string, typeId: string) {
    const vehicle = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        status: 'APPROVED',
        typeId: typeId,
        isActive: true,
        approvedAt: new Date(),
      },
      include: {
        driver: {
          include: {
            user: true,
          },
        },
        type: true,
      },
    });

    // Send FCM notification
    if (vehicle.driver.user.fcmToken) {
      await this.firebaseService.sendNotification(
        vehicle.driver.user.fcmToken,
        'تم الموافقة على المركبة',
        `تم الموافقة على مركبتك ${vehicle.brand} ${vehicle.model} كنوع ${vehicle.type?.nameAr || vehicle.type?.name}`,
        { type: 'VEHICLE_APPROVED', vehicleId: vehicle.id },
      );
    }

    console.log(`✅ Vehicle ${vehicleId} approved as ${vehicle.type?.name}`);

    return { success: true, vehicle };
  }

  async rejectVehicle(vehicleId: string, reason: string) {
    const vehicle = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        status: 'REJECTED',
        isActive: false,
      },
      include: {
        driver: {
          include: {
            user: true,
          },
        },
      },
    });

    // Send FCM notification
    if (vehicle.driver.user.fcmToken) {
      await this.firebaseService.sendNotification(
        vehicle.driver.user.fcmToken,
        'تم رفض المركبة',
        `تم رفض مركبتك ${vehicle.brand} ${vehicle.model}. السبب: ${reason}`,
        { type: 'VEHICLE_REJECTED', vehicleId: vehicle.id, reason },
      );
    }

    console.log(`❌ Vehicle ${vehicleId} rejected: ${reason}`);

    return { success: true, vehicle };
  }

  async seedEmployerAccount() {
    const results: string[] = [];

    // 1. Seed system settings
    const requiredSettings = [
      { key: 'matching_strategy', value: 'NEAREST', category: 'matching' },
      { key: 'matching_max_drivers', value: 5, category: 'matching' },
      { key: 'matching_radius_km', value: 10, category: 'matching' },
      { key: 'commission_rate_percent', value: 15, category: 'payment' },
      { key: 'ride_offer_expiry_seconds', value: 30, category: 'matching' },
      { key: 'min_driver_rating', value: 4.0, category: 'matching' },
      { key: 'driver_minimum_balance', value: 0, category: 'payment' },
    ];

    for (const s of requiredSettings) {
      const exists = await this.prisma.systemSetting.findUnique({ where: { key: s.key } });
      if (!exists) {
        await this.prisma.systemSetting.create({ data: s });
        results.push(`Setting ${s.key} created`);
      }
    }

    // 2. Seed vehicle types
    const vehicleTypes = [
      { name: 'Economy', nameAr: 'اقتصادية', nameFr: 'Économique', basePrice: 50, pricePerKm: 15, pricePerMin: 2, minFare: 100, capacity: 4, icon: 'car' },
      { name: 'Comfort', nameAr: 'مريحة', nameFr: 'Confort', basePrice: 80, pricePerKm: 20, pricePerMin: 3, minFare: 150, capacity: 4, icon: 'car' },
    ];

    for (const vt of vehicleTypes) {
      const exists = await this.prisma.vehicleType.findFirst({ where: { name: vt.name } });
      if (!exists) {
        await this.prisma.vehicleType.create({ data: { ...vt, isActive: true } });
        results.push(`Vehicle type ${vt.name} created`);
      }
    }

    // 3. Create company
    let company = await this.prisma.company.findFirst({ where: { registrationNumber: 'Masar-001' } });
    if (!company) {
      company = await this.prisma.company.create({
        data: {
          name: 'شركة مسار للنقل',
          nameAr: 'شركة مسار للنقل',
          registrationNumber: 'Masar-001',
          contactPerson: 'مدير الشركة',
          contactPhone: '+22212345670',
          contactEmail: 'admin@masar.mr',
          address: 'نواكشوط',
          city: 'نواكشوط',
          status: 'ACTIVE',
          isActive: true,
          billingType: 'POSTPAID',
          creditLimit: 50000,
          currentBalance: 0,
          paymentTermDays: 30,
        },
      });
      results.push(`Company ${company.name} created`);
    }

    // 4. Create employer user
    let employerUser = await this.prisma.user.findUnique({ where: { email: 'employer@masar.mr' } });
    if (!employerUser) {
      employerUser = await this.prisma.user.create({
        data: {
          email: 'employer@masar.mr',
          firstName: 'موظف',
          lastName: 'الشركة',
          phone: '+22212345670',
          phoneVerified: true,
          fcmToken: 'Password123', // Password stored here for v1
        },
      });

      // Create consumer profile linked to company
      await this.prisma.consumer.create({
        data: {
          userId: employerUser.id,
          companyId: company.id,
        },
      });

      // Create wallet
      await this.prisma.wallet.create({
        data: {
          userId: employerUser.id,
          type: 'CONSUMER',
          balance: 10000,
          currency: 'MRU',
        },
      });

      results.push(`Employer account created: employer@masar.mr / Password123`);
    } else {
      results.push(`Employer account already exists: employer@masar.mr`);
    }

    // 5. Fix existing driver vehicles: replace short typeId strings with proper UUIDs
    const allVehicleTypes = await this.prisma.vehicleType.findMany({ where: { isActive: true } });

    // Add a comfort vehicle for each driver that doesn't already have one
    const allDriversWithVehicles = await this.prisma.driver.findMany({
      where: { status: 'APPROVED' },
      include: { vehicles: true },
    });
    const comfortType = allVehicleTypes.find(vt => vt.name === 'Comfort');
    for (const driver of allDriversWithVehicles) {
      const hasComfort = driver.vehicles.some(v => v.typeId === comfortType?.id);
      if (!hasComfort && comfortType) {
        const existingVehicle = driver.vehicles[0];
        if (existingVehicle) {
          await this.prisma.vehicle.create({
            data: {
              driverId: driver.id,
              typeId: comfortType.id,
              brand: existingVehicle.brand,
              model: existingVehicle.model,
              year: existingVehicle.year,
              color: 'Black',
              colorAr: 'أسود',
              plateNumber: `${existingVehicle.plateNumber}-C`,
              registrationNumber: `${existingVehicle.registrationNumber}-C`,
              registrationExpiry: existingVehicle.registrationExpiry,
              status: 'APPROVED',
              isActive: true,
            },
          });
          results.push(`Created Comfort vehicle for driver ${driver.id}`);
        }
      }
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where: { isActive: true },
      include: { driver: true },
    });

    for (const vehicle of vehicles) {
      // Check if typeId is a short string (not a UUID) or invalid
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vehicle.typeId || '');
      if (!isUuid && vehicle.typeId) {
        const vehicleType = allVehicleTypes.find(vt => vt.name.toLowerCase() === vehicle.typeId!.toLowerCase());
        if (vehicleType) {
          await this.prisma.vehicle.update({
            where: { id: vehicle.id },
            data: { typeId: vehicleType.id },
          });
          results.push(`Fixed vehicle ${vehicle.id}: typeId ${vehicle.typeId} → ${vehicleType.id} (${vehicleType.name})`);
        } else {
          // Default to first vehicle type
          const defaultType = allVehicleTypes[0];
          if (defaultType) {
            await this.prisma.vehicle.update({
              where: { id: vehicle.id },
              data: { typeId: defaultType.id },
            });
            results.push(`Defaulted vehicle ${vehicle.id} typeId to ${defaultType.name}`);
          }
        }
      } else if (!vehicle.typeId) {
        const defaultType = allVehicleTypes[0];
        if (defaultType) {
          await this.prisma.vehicle.update({
            where: { id: vehicle.id },
            data: { typeId: defaultType.id },
          });
          results.push(`Set vehicle ${vehicle.id} typeId to ${defaultType.name} (was null)`);
        }
      }

      // Fix driver location if missing
      if (vehicle.driver && (!vehicle.driver.currentLat || !vehicle.driver.currentLng)) {
        await this.prisma.driver.update({
          where: { id: vehicle.driver.id },
          data: {
            currentLat: 18.0792211,
            currentLng: -15.9646747,
            lastLocationAt: new Date(),
          },
        });
        results.push(`Set default location for driver ${vehicle.driver.id}`);
      }

      // Make sure driver is online
      if (vehicle.driver && !vehicle.driver.isOnline) {
        await this.prisma.driver.update({
          where: { id: vehicle.driver.id },
          data: { isOnline: true },
        });
        results.push(`Set driver ${vehicle.driver.id} to online`);
      }
    }

    return {
      success: true,
      message: 'تم تجهيز بيانات الاختبار',
      results,
      loginInfo: {
        email: 'employer@masar.mr',
        password: 'Password123',
        companyName: 'شركة مسار للنقل',
      },
    };
  }
}

