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

  async createRide(data: {
    consumerId: string;
    vehicleTypeId: string;
    pickupAddress: string;
    pickupLatitude: number;
    pickupLongitude: number;
    dropoffAddress: string;
    dropoffLatitude: number;
    dropoffLongitude: number;
    promoCode?: string;
    paymentMethod: string;
    scheduledFor?: Date;
  }) {
    // Estimate fare
    const fareEstimate = await this.fareService.estimateFare(
      data.vehicleTypeId,
      data.pickupLatitude,
      data.pickupLongitude,
      data.dropoffLatitude,
      data.dropoffLongitude,
      data.promoCode,
    );

    // Create ride
    const ride = await this.prisma.ride.create({
      data: {
        consumerId: data.consumerId,
        vehicleTypeId: data.vehicleTypeId,
        pickupAddress: data.pickupAddress,
        pickupLatitude: data.pickupLatitude,
        pickupLongitude: data.pickupLongitude,
        dropoffAddress: data.dropoffAddress,
        dropoffLatitude: data.dropoffLatitude,
        dropoffLongitude: data.dropoffLongitude,
        estimatedFare: fareEstimate.total,
        estimatedDistance: fareEstimate.distanceFare / 10, // Rough estimate
        promoCode: data.promoCode,
        paymentMethod: data.paymentMethod,
        status: data.scheduledFor ? 'SCHEDULED' : 'PENDING',
        scheduledFor: data.scheduledFor,
      },
    });

    // Log ride creation
    await this.logRideStatus(ride.id, 'PENDING', data.consumerId);

    // If not scheduled, start matching immediately
    if (!data.scheduledFor) {
      await this.matchingService.findAndNotifyDrivers(
        ride.id,
        data.pickupLatitude,
        data.pickupLongitude,
        data.vehicleTypeId,
      );
    }

    return { ...ride, fareEstimate };
  }

  async acceptRide(rideId: string, driverId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (ride.status !== 'PENDING') {
      throw new BadRequestException('Ride is no longer available');
    }

    // Check if driver has a pending offer
    const offer = await this.prisma.rideOffer.findFirst({
      where: {
        rideId,
        driverId,
        status: 'PENDING',
      },
    });

    if (!offer) {
      throw new BadRequestException('No pending offer found for this ride');
    }

    // Update ride
    const updatedRide = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        driverId,
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });

    // Update offer status
    await this.prisma.rideOffer.update({
      where: { id: offer.id },
      data: { status: 'ACCEPTED' },
    });

    // Reject other pending offers
    await this.prisma.rideOffer.updateMany({
      where: {
        rideId,
        id: { not: offer.id },
        status: 'PENDING',
      },
      data: { status: 'REJECTED' },
    });

    // Update driver acceptance rate
    await this.updateDriverAcceptanceRate(driverId);

    // Log status change
    await this.logRideStatus(rideId, 'ACCEPTED', driverId);

    return updatedRide;
  }

  async arriveAtPickup(rideId: string, driverId: string) {
    const ride = await this.validateRideAndDriver(rideId, driverId, 'ACCEPTED');

    const updatedRide = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'ARRIVED',
        arrivedAt: new Date(),
      },
    });

    await this.logRideStatus(rideId, 'ARRIVED', driverId);

    return updatedRide;
  }

  async startRide(rideId: string, driverId: string) {
    const ride = await this.validateRideAndDriver(rideId, driverId, 'ARRIVED');

    const updatedRide = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });

    await this.logRideStatus(rideId, 'IN_PROGRESS', driverId);

    return updatedRide;
  }

  async completeRide(rideId: string, driverId: string, actualDistance: number) {
    const ride = await this.validateRideAndDriver(rideId, driverId, 'IN_PROGRESS');

    if (!ride.startedAt) {
      throw new BadRequestException('Ride has not been started');
    }

    const completedAt = new Date();
    const durationMinutes = (completedAt.getTime() - ride.startedAt.getTime()) / 60000;

    // Calculate final fare
    const finalFare = await this.fareService.calculateFare(
      ride.vehicleTypeId,
      actualDistance,
      durationMinutes,
      1.0, // Surge already applied in estimate
      ride.promoCode || undefined,
    );

    // Calculate driver earnings (80% of fare)
    const platformFee = finalFare.total * 0.2;
    const driverEarnings = finalFare.total - platformFee;

    const updatedRide = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'COMPLETED',
        completedAt,
        actualDistance,
        actualDuration: durationMinutes,
        finalFare: finalFare.total,
        platformFee,
        driverEarnings,
      },
    });

    await this.logRideStatus(rideId, 'COMPLETED', driverId);

    // Process payment
    await this.processPayment(updatedRide);

    return updatedRide;
  }

  async cancelRide(rideId: string, userId: string, reason: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (ride.status === 'COMPLETED' || ride.status === 'CANCELLED') {
      throw new BadRequestException('Ride cannot be cancelled');
    }

    // Calculate cancellation fee
    let cancellationFee = 0;
    if (ride.status === 'IN_PROGRESS') {
      cancellationFee = ride.estimatedFare * 0.5; // 50% cancellation fee
    } else if (ride.status === 'ARRIVED') {
      cancellationFee = ride.estimatedFare * 0.3; // 30% cancellation fee
    }

    const updatedRide = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancellationReason: reason,
        cancellationFee,
      },
    });

    await this.logRideStatus(rideId, 'CANCELLED', userId);

    return updatedRide;
  }

  async getRideById(rideId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        consumer: true,
        driver: true,
        vehicleType: true,
      },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    return ride;
  }

  async getUserRides(userId: string, role: string) {
    const where: any = role === 'DRIVER' ? { driverId: userId } : { consumerId: userId };

    return this.prisma.ride.findMany({
      where,
      include: {
        consumer: true,
        driver: true,
        vehicleType: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async validateRideAndDriver(rideId: string, driverId: string, expectedStatus: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (ride.driverId !== driverId) {
      throw new BadRequestException('You are not assigned to this ride');
    }

    if (ride.status !== expectedStatus) {
      throw new BadRequestException(`Ride must be in ${expectedStatus} status`);
    }

    return ride;
  }

  private async logRideStatus(rideId: string, status: string, userId: string) {
    await this.prisma.rideStatusLog.create({
      data: {
        rideId,
        status,
        changedBy: userId,
      },
    });
  }

  private async updateDriverAcceptanceRate(driverId: string) {
    const [totalOffers, acceptedOffers] = await Promise.all([
      this.prisma.rideOffer.count({
        where: { driverId },
      }),
      this.prisma.rideOffer.count({
        where: { driverId, status: 'ACCEPTED' },
      }),
    ]);

    const acceptanceRate = totalOffers > 0 ? acceptedOffers / totalOffers : 0;

    await this.prisma.user.update({
      where: { id: driverId },
      data: { acceptanceRate },
    });
  }

  private async processPayment(ride: any) {
    // Payment processing will be implemented in Payment module
    // For now, just create a payment record
    await this.prisma.payment.create({
      data: {
        rideId: ride.id,
        userId: ride.consumerId,
        amount: ride.finalFare,
        paymentMethod: ride.paymentMethod,
        status: 'PENDING',
      },
    });
  }
}
