import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminsService {
  constructor(private prisma: PrismaService) {}

  async approveDriver(driverId: string, approvedBy: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    if (driver.status === 'APPROVED') {
      throw new BadRequestException('Driver is already approved');
    }

    // Update driver status
    const updatedDriver = await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedById: approvedBy,
      },
      include: { user: true },
    });

    // Log the approval
    await this.prisma.auditLog.create({
      data: {
        userId: approvedBy,
        action: 'DRIVER_APPROVED',
        resource: 'DRIVER',
        resourceId: driverId,
        newValue: { status: 'APPROVED' },
      },
    });

    return updatedDriver;
  }

  async rejectDriver(driverId: string, rejectedBy: string, reason: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Update driver status
    const updatedDriver = await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        status: 'REJECTED',
      },
      include: { user: true },
    });

    // Log the rejection
    await this.prisma.auditLog.create({
      data: {
        userId: rejectedBy,
        action: 'DRIVER_REJECTED',
        resource: 'DRIVER',
        resourceId: driverId,
        newValue: { status: 'REJECTED', reason },
      },
    });

    return updatedDriver;
  }

  async suspendDriver(driverId: string, suspendedBy: string, reason: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Update driver status
    const updatedDriver = await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        status: 'SUSPENDED',
        isOnline: false,
      },
      include: { user: true },
    });

    // Log the suspension
    await this.prisma.auditLog.create({
      data: {
        userId: suspendedBy,
        action: 'DRIVER_SUSPENDED',
        resource: 'DRIVER',
        resourceId: driverId,
        newValue: { status: 'SUSPENDED', reason },
      },
    });

    return updatedDriver;
  }

  async getPendingDrivers() {
    return this.prisma.driver.findMany({
      where: {
        status: 'PENDING',
      },
      include: {
        user: true,
        vehicles: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllDrivers(status?: string) {
    const where: any = {};
    
    if (status) {
      where.status = status;
    }

    return this.prisma.driver.findMany({
      where,
      include: {
        user: true,
        vehicles: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllUsers() {
    return this.prisma.user.findMany({
      include: {
        driver: true,
        consumer: true,
        admin: true,
        employee: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
