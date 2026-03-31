import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FindAllDriversDto, UpdateDriverStatusDto, UpdateDriverBalanceDto, DriverResponseDto } from './dto/drivers.dto';

@Injectable()
export class DriversService {
  constructor(private readonly prismaService: PrismaService) {}

  async findAll(query: FindAllDriversDto) {
    const {
      status,
      search,
      page = 1,
      limit = 20,
    } = query;

    const where: any = {};

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (search) {
      // Search by name, phone, license
      const driversWithUser = await this.prismaService.driver.findMany({
        where,
        include: {
          user: true,
        },
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      });

      // Filter by user name/phone manually since Prisma OR on related model not straightforward
      const filtered = driversWithUser.filter(
        (d) =>
          d.user.firstName?.toLowerCase().includes(search.toLowerCase()) ||
          d.user.lastName?.toLowerCase().includes(search.toLowerCase()) ||
          d.user.phone?.includes(search) ||
          d.licenseNumber?.toLowerCase().includes(search.toLowerCase()),
      );

      const total = await this.prismaService.driver.count({ where });
      return {
        drivers: await Promise.all(filtered.map((d) => this.mapToResponseDto(d))),
        total,
        page: Number(page),
        limit: Number(limit),
      };
    } else {
      const drivers = await this.prismaService.driver.findMany({
        where,
        include: {
          user: {
            select: {
              phone: true,
              firstName: true,
              lastName: true,
            },
          },
          vehicles: true,
        },
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      });

      const total = await this.prismaService.driver.count({ where });

      return {
        drivers: drivers.map((d) => this.mapToResponseDto(d)),
        total,
        page: Number(page),
        limit: Number(limit),
      };
    }
  }

  async findOne(id: string) {
    const driver = await this.prismaService.driver.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            phone: true,
            firstName: true,
            lastName: true,
          },
        },
        vehicles: true,
        wallet: true,
        rides: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            vehicleType: {
              select: { name: true, nameAr: true },
            },
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with ID ${id} not found`);
    }

    const response = this.mapToResponseDto(driver);
    // Add extra details for detail view
    response.wallet = driver.wallet ? { balance: driver.wallet.balance } : null;
    response.recentRides = driver.rides.map((r: any) => ({
      id: r.id,
      rideNumber: r.rideNumber,
      status: r.status,
      fare: r.finalFare || r.estimatedFare,
      createdAt: r.createdAt,
      vehicleType: r.vehicleType,
    }));

    return response;
  }

  async updateStatus(driverId: string, updateDto: UpdateDriverStatusDto) {
    const { status, reason } = updateDto;

    const driver = await this.prismaService.driver.update({
      where: { id: driverId },
      data: {
        status,
        // Optionally handle approvedAt timestamp
        ...(status === 'APPROVED' ? { approvedAt: new Date() } : {}),
      },
      include: {
        user: {
          select: {
            phone: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // TODO: Create AuditLog entry for status change (optional for MVP)

    return this.mapToResponseDto(driver);
  }

  async adjustBalance(driverId: string, dto: UpdateDriverBalanceDto, actor: any) {
    const { amount, reason } = dto;

    // Fetch driver and wallet
    const driver = await this.prismaService.driver.findUnique({
      where: { id: driverId },
      include: {
        wallet: true,
        user: true,
      },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with ID ${driverId} not found`);
    }

    if (!driver.wallet) {
      throw new BadRequestException('Driver does not have a wallet');
    }

    const balanceBefore = parseFloat(driver.wallet.balance.toString());
    const amountNum = parseFloat(amount.toString());
    const balanceAfter = balanceBefore + amountNum;

    // Create balance log
    await this.prismaService.driverBalanceLog.create({
      data: {
        driverId,
        employeeId: actor.employeeId || actor.adminId, // from token
        action: amountNum > 0 ? 'ADD_BALANCE' : 'DEDUCT_BALANCE',
        amount: amountNum,
        balanceBefore: balanceBefore,
        balanceAfter: balanceAfter,
        reason,
      },
    });

    // Update wallet balance
    const wallet = await this.prismaService.wallet.update({
      where: { id: driver.wallet.id },
      data: {
        balance: balanceAfter,
      },
    });

    return {
      driverId,
      amount: amountNum,
      reason,
      balanceBefore,
      newBalance: parseFloat(wallet.balance.toString()),
    };
  }

  async findOnline(includeLocation = false) {
    const drivers = await this.prismaService.driver.findMany({
      where: {
        isOnline: true,
      },
      include: {
        user: {
          select: {
            phone: true,
            firstName: true,
            lastName: true,
          },
        },
        ...(includeLocation && {
          locationHistory: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        }),
      },
    });

    return drivers.map((d) => {
      const resp = this.mapToResponseDto(d);
      if (includeLocation && d.locationHistory[0]) {
        resp.currentLat = d.locationHistory[0].lat;
        resp.currentLng = d.locationHistory[0].lng;
      }
      return resp;
    });
  }

  private mapToResponseDto(driver: any): DriverResponseDto {
    const fullName = driver.user?.firstName && driver.user?.lastName
      ? `${driver.user.firstName} ${driver.user.lastName}`
      : driver.user?.firstName || driver.user?.lastName || 'Unknown';

    // Compute trips count from rides
    const trips = driver.rides?.length || 0;
    const rating = driver.rating || 5.0;

    // Map status to Arabic and ENUM
    const statusMap: Record<string, { ar: string; en: string }> = {
      PENDING: { ar: 'معلق', en: 'PENDING' },
      APPROVED: { ar: 'مفعّل', en: 'APPROVED' },
      SUSPENDED: { ar: 'موقوف', en: 'SUSPENDED' },
      REJECTED: { ar: 'مرفوض', en: 'REJECTED' },
      INACTIVE: { ar: 'غير نشط', en: 'INACTIVE' },
    };
    const statusInfo = statusMap[driver.status] || { ar: 'غير معروف', en: driver.status };

    return {
      id: driver.id,
      name: fullName,
      phone: driver.user?.phone || '',
      rating,
      trips,
      status: statusInfo.ar,
      statusEn: statusInfo.en,
      vehicles: driver.vehicles?.map((v: any) => ({
        id: v.id,
        type: v.type?.name || '',
        plateNumber: v.plateNumber,
        status: v.status,
      })) || [],
      licenseNumber: driver.licenseNumber,
      isOnline: driver.isOnline,
      currentLat: driver.currentLat,
      currentLng: driver.currentLng,
    };
  }
}
