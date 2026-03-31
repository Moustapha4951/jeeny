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
        user: true,
        vehicles: true,
      },
    });

    return driver;
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
}
