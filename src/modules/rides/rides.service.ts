import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FareService } from './fare.service';
import { MatchingService } from './matching.service';
import { ConsumerGateway } from '../consumer-gateway/consumer.gateway';
import { DriverGateway } from '../driver/driver.gateway';

@Injectable()
export class RidesService {
  constructor(
    private prisma: PrismaService,
    private fareService: FareService,
    private matchingService: MatchingService,
    private consumerGateway: ConsumerGateway,
    private driverGateway: DriverGateway,
  ) {}

  async createRideFromConsumer(userId: string, dto: any) {
    let consumer =
        await this.prisma.consumer.findUnique({ where: { userId } });
    // Backfill: any authenticated user can become a consumer on first
    // ride. Driver/employee accounts that signed up before the consumer
    // profile was added in verifyOtp would otherwise hit a 404 here.
    consumer ??= await this.prisma.consumer.create({
      data: { userId },
    });

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
    const rides = await this.prisma.ride.findMany({
      where,
      include: {
        consumer: { include: { user: true } },
        driver: { include: { user: true } },
        vehicleType: true,
        ratings: {
          where: { fromUserId: userId },
          select: { id: true, score: true, tags: true, comment: true },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Flatten the per-ride 'myRating' so the consumer app can render
    // a "rate this ride" CTA without an extra round trip.
    return rides.map((r: any) => ({
      ...r,
      myRating: r.ratings?.[0] ?? null,
    }));
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
    await this.broadcastRideUpdate(rideId);
    return updatedRide;
  }

  /// Push the latest ride payload to the rider over WS so they see the
  /// status flip without waiting for the next poll.
  private async broadcastRideUpdate(rideId: string) {
    try {
      const ride = await this.prisma.ride.findUnique({
        where: { id: rideId },
        include: {
          consumer: { include: { user: true } },
          driver: { include: { user: true } },
          vehicle: true,
          vehicleType: true,
        },
      });
      if (!ride) return;
      // Push to the rider over the consumer gateway.
      this.consumerGateway.emitRideUpdate(rideId, ride);
      // Push to the driver over the driver gateway, so a rider-side
      // cancel reaches the driver app instantly.
      if (ride.driverId) {
        await this.driverGateway.sendRideUpdate(ride.driverId, ride);
      }
    } catch (e) {
      console.error('Failed to broadcast ride update:', e);
    }
  }

  /// Lightweight nearby-drivers query for the consumer map. Returns
  /// just lat/lng + heading so we can drop pins. No driver identity is
  /// exposed.
  async getNearbyDrivers(
    pickupLat: number,
    pickupLng: number,
    vehicleTypeId?: string,
  ) {
    const RADIUS_KM = 5;
    const drivers = vehicleTypeId
        ? await this.matchingService.findNearbyDrivers(
            pickupLat,
            pickupLng,
            RADIUS_KM,
            vehicleTypeId,
            0,
          )
        : await this.prisma.driver.findMany({
            where: {
              isOnline: true,
              isOnTrip: false,
              status: 'APPROVED',
              currentLat: { not: null },
              currentLng: { not: null },
            },
            select: {
              id: true,
              currentLat: true,
              currentLng: true,
              heading: true,
            },
            take: 30,
          });
    return {
      drivers: drivers
          .map((d: any) => ({
            id: d.id,
            lat: d.currentLat ? Number(d.currentLat) : null,
            lng: d.currentLng ? Number(d.currentLng) : null,
            heading: d.heading ? Number(d.heading) : 0,
          }))
          .filter((d: any) => d.lat != null && d.lng != null),
    };
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
