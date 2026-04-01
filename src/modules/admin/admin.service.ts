import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

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

  async bookRideForCustomer(bookingData: any) {
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

    // Get default vehicle type if not provided
    let selectedVehicleTypeId = vehicleTypeId;
    if (!selectedVehicleTypeId) {
      const defaultVehicleType = await this.prisma.vehicleType.findFirst({
        where: { isActive: true },
        orderBy: { basePrice: 'asc' },
      });
      selectedVehicleTypeId = defaultVehicleType?.id;
    }

    if (!selectedVehicleTypeId) {
      return {
        success: false,
        message: 'لا يوجد نوع مركبة متاح',
      };
    }

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
    const distanceKm = R * c;

    // Estimate duration (assuming 30 km/h average speed)
    const durationMin = Math.ceil((distanceKm / 30) * 60);

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
    const { pickupLat, pickupLng, dropoffLat, dropoffLng, distanceKm, durationMin } = estimateData;

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

    // Get default vehicle type for pricing
    const defaultVehicleType = await this.prisma.vehicleType.findFirst({
      where: { isActive: true },
      orderBy: { basePrice: 'asc' },
    });

    let estimatedFare = 100; // Default fallback
    if (defaultVehicleType) {
      estimatedFare =
        Number(defaultVehicleType.basePrice) +
        Number(defaultVehicleType.pricePerKm) * calculatedDistanceKm +
        Number(defaultVehicleType.pricePerMin) * calculatedDurationMin;

      // Apply minimum fare
      if (estimatedFare < Number(defaultVehicleType.minFare)) {
        estimatedFare = Number(defaultVehicleType.minFare);
      }
    }

    return {
      estimatedFare: Number(estimatedFare.toFixed(0)),
      distanceKm: Number(calculatedDistanceKm.toFixed(2)),
      durationMin: calculatedDurationMin,
    };
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

    await this.prisma.ride.update({
      where: { id },
      data: {
        status: 'CANCELLED_BY_RIDER', // Using CANCELLED_BY_RIDER for admin cancellations
        cancelledAt: new Date(),
        cancelReason: reason || 'تم الإلغاء من قبل الإدارة',
        cancelledBy: 'ADMIN',
      },
    });

    return {
      success: true,
      message: 'تم إلغاء الرحلة بنجاح',
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
    const zones = await this.prisma.zone.findMany({
      include: {
        city: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return zones;
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
}

