import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminsService {
  constructor(private prisma: PrismaService) {}

  async approveDriver(driverId: string, approvedBy: string) {
    const driver = await this.prisma.user.findFirst({
      where: { id: driverId, role: 'DRIVER' },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    if (driver.status === 'APPROVED') {
      throw new BadRequestException('Driver is already approved');
    }

    // Update driver status
    const updatedDriver = await this.prisma.user.update({
      where: { id: driverId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedBy,
      },
    });

    // Log the approval
    await this.prisma.auditLog.create({
      data: {
        userId: approvedBy,
        action: 'DRIVER_APPROVED',
        entityType: 'USER',
        entityId: driverId,
        details: { driverId, status: 'APPROVED' },
      },
    });

    return updatedDriver;
  }

  async rejectDriver(driverId: string, rejectedBy: string, reason: string) {
    const driver = await this.prisma.user.findFirst({
      where: { id: driverId, role: 'DRIVER' },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Update driver status
    const updatedDriver = await this.prisma.user.update({
      where: { id: driverId },
      data: {
        status: 'REJECTED',
        rejectionReason: reason,
      },
    });

    // Log the rejection
    await this.prisma.auditLog.create({
      data: {
        userId: rejectedBy,
        action: 'DRIVER_REJECTED',
        entityType: 'USER',
        entityId: driverId,
        details: { driverId, status: 'REJECTED', reason },
      },
    });

    return updatedDriver;
  }

  async suspendDriver(driverId: string, suspendedBy: string, reason: string) {
    const driver = await this.prisma.user.findFirst({
      where: { id: driverId, role: 'DRIVER' },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Update driver status
    const updatedDriver = await this.prisma.user.update({
      where: { id: driverId },
      data: {
        status: 'SUSPENDED',
        isOnline: false,
      },
    });

    // Log the suspension
    await this.prisma.auditLog.create({
      data: {
        userId: suspendedBy,
        action: 'DRIVER_SUSPENDED',
        entityType: 'USER',
        entityId: driverId,
        details: { driverId, status: 'SUSPENDED', reason },
      },
    });

    return updatedDriver;
  }

  async getPendingDrivers() {
    return this.prisma.user.findMany({
      where: {
        role: 'DRIVER',
        status: 'PENDING',
      },
      include: {
        driverProfile: true,
        vehicle: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllDrivers(status?: string) {
    const where: any = { role: 'DRIVER' };
    
    if (status) {
      where.status = status;
    }

    return this.prisma.user.findMany({
      where,
      include: {
        driverProfile: true,
        vehicle: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllUsers(role?: string) {
    const where: any = {};
    
    if (role) {
      where.role = role;
    }

    return this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}
