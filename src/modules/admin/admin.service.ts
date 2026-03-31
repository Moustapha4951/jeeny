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
        rideNumber: ride.rideNumber,
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
            user: true,
          },
        },
        driver: {
          include: {
            user: true,
          },
        },
        vehicleType: true,
      },
    });

    return ride;
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

  async bookRideForCustomer(bookingData: any) {
    const {
      customerPhone,
      pickupAddress,
      dropoffAddress,
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng,
      manualFare,
      vehicleTypeId,
    } = bookingData;

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

    // If consumer doesn't exist, create one
    if (!consumer) {
      const user = await this.prisma.user.create({
        data: {
          phone: customerPhone,
          phoneVerified: true,
          firstName: 'عميل',
          lastName: 'جديد',
        },
      });

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
    const { pickupLat, pickupLng, dropoffLat, dropoffLng } = estimateData;

    // Calculate distance (Haversine formula)
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

    // Get default vehicle type for pricing
    const defaultVehicleType = await this.prisma.vehicleType.findFirst({
      where: { isActive: true },
      orderBy: { basePrice: 'asc' },
    });

    let estimatedFare = 100; // Default fallback
    if (defaultVehicleType) {
      estimatedFare =
        Number(defaultVehicleType.basePrice) +
        Number(defaultVehicleType.pricePerKm) * distanceKm +
        Number(defaultVehicleType.pricePerMin) * durationMin;

      // Apply minimum fare
      if (estimatedFare < Number(defaultVehicleType.minFare)) {
        estimatedFare = Number(defaultVehicleType.minFare);
      }
    }

    return {
      estimatedFare: Number(estimatedFare.toFixed(0)),
      distanceKm: Number(distanceKm.toFixed(2)),
      durationMin,
    };
  }
}
