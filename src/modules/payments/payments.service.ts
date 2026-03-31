import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private walletService: WalletService,
  ) {}

  async processRidePayment(rideId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        consumer: true,
        driver: true,
      },
    });

    if (!ride) {
      throw new BadRequestException('Ride not found');
    }

    if (ride.status !== 'COMPLETED') {
      throw new BadRequestException('Ride must be completed before payment');
    }

    // Check if payment already exists
    const existingPayment = await this.prisma.payment.findFirst({
      where: { rideId, status: 'COMPLETED' },
    });

    if (existingPayment) {
      return existingPayment;
    }

    // Process payment based on method
    switch (ride.paymentMethod) {
      case 'WALLET':
        return this.processWalletPayment(ride);
      case 'CASH':
        return this.processCashPayment(ride);
      case 'CARD':
        return this.processCardPayment(ride);
      default:
        throw new BadRequestException('Invalid payment method');
    }
  }

  private async processWalletPayment(ride: any) {
    try {
      // Debit consumer wallet
      await this.walletService.debitBalance(
        ride.consumerId,
        ride.finalFare,
        `Payment for ride ${ride.id}`,
        ride.id,
      );

      // Credit driver wallet (driver earnings)
      await this.walletService.creditBalance(
        ride.driverId,
        ride.driverEarnings,
        `Earnings from ride ${ride.id}`,
        ride.id,
      );

      // Create payment record
      const payment = await this.prisma.payment.create({
        data: {
          rideId: ride.id,
          userId: ride.consumerId,
          amount: ride.finalFare,
          paymentMethod: 'WALLET',
          status: 'COMPLETED',
        },
      });

      this.logger.log(`Wallet payment processed for ride ${ride.id}`);
      return payment;
    } catch (error) {
      this.logger.error(`Wallet payment failed for ride ${ride.id}:`, error);
      
      // Create failed payment record
      await this.prisma.payment.create({
        data: {
          rideId: ride.id,
          userId: ride.consumerId,
          amount: ride.finalFare,
          paymentMethod: 'WALLET',
          status: 'FAILED',
          failureReason: error.message,
        },
      });

      throw error;
    }
  }

  private async processCashPayment(ride: any) {
    // For cash payments, driver collects cash and we credit their wallet
    await this.walletService.creditBalance(
      ride.driverId,
      ride.driverEarnings,
      `Cash earnings from ride ${ride.id}`,
      ride.id,
    );

    // Create payment record
    const payment = await this.prisma.payment.create({
      data: {
        rideId: ride.id,
        userId: ride.consumerId,
        amount: ride.finalFare,
        paymentMethod: 'CASH',
        status: 'COMPLETED',
      },
    });

    this.logger.log(`Cash payment recorded for ride ${ride.id}`);
    return payment;
  }

  private async processCardPayment(ride: any) {
    // Card payment will be integrated with payment gateway
    // For now, create pending payment
    const payment = await this.prisma.payment.create({
      data: {
        rideId: ride.id,
        userId: ride.consumerId,
        amount: ride.finalFare,
        paymentMethod: 'CARD',
        status: 'PENDING',
      },
    });

    this.logger.log(`Card payment initiated for ride ${ride.id}`);
    return payment;
  }

  async processRefund(paymentId: string, reason: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        ride: true,
      },
    });

    if (!payment) {
      throw new BadRequestException('Payment not found');
    }

    if (payment.status !== 'COMPLETED') {
      throw new BadRequestException('Only completed payments can be refunded');
    }

    // Check if already refunded
    if (payment.refundedAt) {
      throw new BadRequestException('Payment already refunded');
    }

    try {
      // Process refund based on payment method
      if (payment.paymentMethod === 'WALLET') {
        // Credit consumer wallet
        await this.walletService.creditBalance(
          payment.userId,
          payment.amount,
          `Refund for ride ${payment.rideId}`,
          payment.id,
        );

        // Debit driver wallet if they were paid
        if (payment.ride?.driverId && payment.ride?.driverEarnings) {
          await this.walletService.debitBalance(
            payment.ride.driverId,
            payment.ride.driverEarnings,
            `Refund deduction for ride ${payment.rideId}`,
            payment.id,
          );
        }
      }

      // Update payment record
      const updatedPayment = await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          refundedAt: new Date(),
          refundReason: reason,
        },
      });

      this.logger.log(`Refund processed for payment ${paymentId}`);
      return updatedPayment;
    } catch (error) {
      this.logger.error(`Refund failed for payment ${paymentId}:`, error);
      throw error;
    }
  }

  async getPaymentHistory(userId: string, limit: number = 50) {
    return this.prisma.payment.findMany({
      where: { userId },
      include: {
        ride: {
          select: {
            id: true,
            pickupAddress: true,
            dropoffAddress: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getPaymentById(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        ride: true,
      },
    });

    if (!payment) {
      throw new BadRequestException('Payment not found');
    }

    return payment;
  }
}
