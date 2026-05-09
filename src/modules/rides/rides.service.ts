import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FareService } from './fare.service';
import { MatchingService } from './matching.service';

@Injectable()
export class RidesService {
  constructor(
    private prisma: PrismaService,
    private fareService: FareService,
    private matchingService: MatchingService,
  ) {}

  async createRideFromConsumer(userId: string, dto: any) {
    const consumer = await this.prisma.consumer.findUnique({ where: { userId } });
    if (!consumer) throw new NotFoundException('Consumer profile not found');

    return this.createRide({
      consumerId: consumer.id,
      vehicleTypeId: dto.vehicleTypeId,
      pickupAddress: dto.pickupAddress,
      pickupLat: dto.pickupLatitude,
      pickupLng: dto.pickupLongitude,
      dropoffAddress: dto.dropoffAddress,
      dropoffLat: dto.dropoffLatitude,
      dropoffLng: dto.dropoffLongitude,
      promoCodeId: dto.promoCode,
      paymentMethod: dto.paymentMethod,
      scheduledAt: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
    });
  }

  async createRide(data: {
    consumerId: string;
    vehicleTypeId: string;
    pickupAddress: string;
    pickupLat: number;
    pickupLng: number;
    dropoffAddress: string;
    dropoffLat: number;
    dropoffLng: number;
    promoCodeId?: string;
    paymentMethod: string;
    scheduledAt?: Date;
    bookingSource?: string;
  }) {
    const fareEstimate = await this.fareService.estimateFare(
      data.vehicleTypeId,
      data.pickupLat,
      data.pickupLng,
      data.dropoffLat,
      data.dropoffLng,
    );

    const ride = await this.prisma.ride.create({
      data: {
        consumerId: data.consumerId,
        vehicleTypeId: data.vehicleTypeId,
        pickupAddress: data.pickupAddress,
        pickupLat: data.pickupLat,
        pickupLng: data.pickupLng,
        dropoffAddress: data.dropoffAddress,
        dropoffLat: data.dropoffLat,
        dropoffLng: data.dropoffLng,
        distanceKm: fareEstimate.distanceFare / 10,
        durationMin: Math.ceil(fareEstimate.timeFare),
        estimatedFare: fareEstimate.total,
        promoCodeId: data.promoCodeId,
        paymentMethod: data.paymentMethod as any,
        status: data.scheduledAt ? 'PENDING' : 'SEARCHING',
        isScheduled: !!data.scheduledAt,
        scheduledAt: data.scheduledAt,
        bookingSource: (data.bookingSource as any) || 'APP',
      },
    });

    await this.logRideEvent(ride.id, ride.status, { consumerId: data.consumerId });

    if (!data.scheduledAt) {
      this.matchingService.findAndNotifyDrivers(
        ride.id,
        data.pickupLat,
        data.pickupLng,
        data.vehicleTypeId,
      ).catch(err => console.error('Matching error:', err));
    }

    return { ...ride, fareEstimate };
  }

  async getRideById(rideId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: { consumer: { include: { user: true } }, driver: { include: { user: true } }, vehicleType: true },
    });
    if (!ride) throw new NotFoundException('Ride not found');
    return ride;
  }

  async getUserRides(userId: string, role: string) {
    const where = role === 'DRIVER'
      ? { driver: { userId } }
      : { consumer: { userId } };
    return this.prisma.ride.findMany({
      where,
      include: { consumer: { include: { user: true } }, driver: { include: { user: true } }, vehicleType: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async acceptRide(rideId: string, driverId: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');
    if (ride.status !== 'SEARCHING') throw new BadRequestException('Ride is no longer available');

    const offer = await this.prisma.rideOffer.findFirst({
      where: { rideId, driverId, status: 'PENDING' },
    });
    if (!offer) throw new BadRequestException('No pending offer for this ride');

    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { vehicles: { where: { isActive: true, status: 'APPROVED' }, take: 1 } },
    });
    const vehicleId = driver?.vehicles?.[0]?.id;

    const updatedRide = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        driverId,
        vehicleId,
        status: 'DRIVER_ASSIGNED',
        acceptedAt: new Date(),
      },
    });

    await this.prisma.rideOffer.update({
      where: { id: offer.id },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    });

    await this.prisma.rideOffer.updateMany({
      where: { rideId, id: { not: offer.id }, status: 'PENDING' },
      data: { status: 'REJECTED' },
    });

    await this.logRideEvent(rideId, 'DRIVER_ASSIGNED', { driverId });
    return updatedRide;
  }

  async cancelRide(rideId: string, userId: string, reason: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');

    const terminal = ['COMPLETED', 'CANCELLED_BY_RIDER', 'CANCELLED_BY_DRIVER'];
    if (terminal.includes(ride.status)) throw new BadRequestException('Ride cannot be cancelled');

    const isDriver = ride.driverId === userId;
    const updatedRide = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: isDriver ? 'CANCELLED_BY_DRIVER' : 'CANCELLED_BY_RIDER',
        cancelledAt: new Date(),
        cancelReason: reason,
        cancelledBy: isDriver ? 'DRIVER' : 'RIDER',
      },
    });

    if (isDriver) {
      await this.prisma.driver.update({
        where: { id: userId },
        data: { isOnTrip: false },
      });
    }

    await this.logRideEvent(rideId, updatedRide.status, { userId, reason });
    return updatedRide;
  }

  private async logRideEvent(rideId: string, statusOrEvent: string, data?: any) {
    const eventMap: Record<string, string> = {
      PENDING: 'CREATED',
      SEARCHING: 'CREATED',
      DRIVER_ASSIGNED: 'DRIVER_ASSIGNED',
      DRIVER_ARRIVED: 'DRIVER_ARRIVED',
      IN_PROGRESS: 'STARTED',
      COMPLETED: 'COMPLETED',
      CANCELLED_BY_RIDER: 'CANCELLED',
      CANCELLED_BY_DRIVER: 'CANCELLED',
      NO_DRIVERS_FOUND: 'CANCELLED',
    };
    const event = eventMap[statusOrEvent] || statusOrEvent;
    await this.prisma.rideLog.create({
      data: { rideId, event: event as any, data: data || {} },
    });
  }
}
