import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    skip?: number;
    take?: number;
    driverId?: string;
    status?: string[];
    vehicleTypeId?: string;
    licensePlate?: string;
  }) {
    const { skip, take, driverId, status, vehicleTypeId, licensePlate } = params;

    return this.prisma.vehicle.findMany({
      skip,
      take,
      where: {
        driverId: driverId ? { equals: driverId } : undefined,
        status: status ? { in: status } : undefined,
        vehicleTypeId: vehicleTypeId ? { equals: vehicleTypeId } : undefined,
        licensePlate: licensePlate ? { contains: licensePlate } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        driver: true,
        vehicleType: true,
        rides: true,
      },
    });
  }

  async findOne(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        driver: true,
        vehicleType: true,
        rides: true,
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    return vehicle;
  }

  async create(createVehicleDto: Prisma.VehicleCreateInput) {
    return this.prisma.vehicle.create({
      data: createVehicleDto,
      include: {
        driver: true,
        vehicleType: true,
      },
    });
  }

  async approveVehicle(vehicleId: string) {
    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
      },
      include: {
        driver: true,
        vehicleType: true,
      },
    });
  }

  async suspendVehicle(vehicleId: string) {
    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        status: 'SUSPENDED',
        suspendedAt: new Date(),
      },
      include: {
        driver: true,
        vehicleType: true,
      },
    });
  }

  async getDriverVehicles(driverId: string) {
    return this.prisma.vehicle.findMany({
      where: { driverId: driverId },
      orderBy: { createdAt: 'desc' },
      include: {
        vehicleType: true,
      },
    });
  }

  async getAvailableVehicles(params: {
    rideType?: string;
    location?: { latitude: number; longitude: number };
    maxDistance?: number;
  }) {
    const { rideType, location, maxDistance } = params;

    // For now, return all approved vehicles
    // Geospatial filtering would need PostGIS extension
    return this.prisma.vehicle.findMany({
      where: {
        status: 'APPROVED',
        vehicleType: {
          some: {
            rideTypes: { some: { equals: rideType } },
          },
        },
      },
      include: {
        driver: true,
        vehicleType: true,
      },
    });
  }

  async update(vehicleId: string, data: Prisma.VehicleUpdateInput) {
    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data,
      include: {
        driver: true,
        vehicleType: true,
      },
    });
  }

  async delete(vehicleId: string) {
    return this.prisma.vehicle.delete({
      where: { id: vehicleId },
    });
  }
}
