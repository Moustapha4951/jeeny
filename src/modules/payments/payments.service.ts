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
        consumer: { include: { user: true } },
        driver: { include: { user: true } },
      },
    });

    if (!ride) {
      throw new BadRequestException('Ride not found');
    }

    if (ride.status !== 'COMPLETED') {
      throw new BadRequestException('Ride must be completed before payment');
    }

    // Check if transaction already exists
    const existingTransaction = await this.prisma.transaction.findFirst({
      where: { rideId, status: 'COMPLETED', type: 'RIDE_PAYMENT' },
    });

    if (existingTransaction) {
      return existingTransaction;
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
      const finalFare = Number(ride.finalFare || 0);
      const platformCommission = finalFare * 0.15; // 15% platform fee
      const driverEarnings = finalFare - platformCommission;

      // Debit consumer wallet
      await this.walletService.debitBalance(
        ride.consumerId,
        finalFare,
        `Payment for ride ${ride.id}`,
        ride.id,
      );

      // Credit driver wallet (driver earnings after commission)
      await this.walletService.creditBalance(
        ride.driverId,
        driverEarnings,
        `Earnings from ride ${ride.id}`,
        ride.id,
      );

      // Create transaction record
      const transaction = await this.prisma.transaction.create({
        data: {
          userId: ride.consumerId,
          type: 'RIDE_PAYMENT',
          amount: finalFare,
          status: 'COMPLETED',
          rideId: ride.id,
          paymentMethod: 'WALLET',
          description: `Payment for ride ${ride.id}`,
        },
      });

      this.logger.log(`Wallet payment processed for ride ${ride.id}`);
      return transaction;
    } catch (error) {
      this.logger.error(`Wallet payment failed for ride ${ride.id}:`, error);
      
      // Create failed transaction record
      await this.prisma.transaction.create({
        data: {
          userId: ride.consumerId,
          type: 'RIDE_PAYMENT',
          amount: Number(ride.finalFare || 0),
          status: 'FAILED',
          rideId: ride.id,
          paymentMethod: 'WALLET',
          description: `Failed payment for ride ${ride.id}: ${error.message}`,
        },
      });

      throw error;
    }
  }

  private async processCashPayment(ride: any) {
    const finalFare = Number(ride.finalFare || 0);
    const platformCommission = finalFare * 0.15; // 15% platform fee
    const driverEarnings = finalFare - platformCommission;

    // For cash payments, driver collects cash and we credit their wallet
    await this.walletService.creditBalance(
      ride.driverId,
      driverEarnings,
      `Cash earnings from ride ${ride.id}`,
      ride.id,
    );

    // Create transaction record
    const transaction = await this.prisma.transaction.create({
      data: {
        userId: ride.consumerId,
        type: 'RIDE_PAYMENT',
        amount: finalFare,
        status: 'COMPLETED',
        rideId: ride.id,
        paymentMethod: 'CASH',
        description: `Cash payment for ride ${ride.id}`,
      },
    });

    this.logger.log(`Cash payment recorded for ride ${ride.id}`);
    return transaction;
  }

  private async processCardPayment(ride: any) {
    // Card payment will be integrated with payment gateway
    // For now, create pending transaction
    const transaction = await this.prisma.transaction.create({
      data: {
        userId: ride.consumerId,
        type: 'RIDE_PAYMENT',
        amount: Number(ride.finalFare || 0),
        status: 'PENDING',
        rideId: ride.id,
        paymentMethod: 'CARD',
        description: `Card payment for ride ${ride.id}`,
      },
    });

    this.logger.log(`Card payment initiated for ride ${ride.id}`);
    return transaction;
  }

  async processRefund(transactionId: string, reason: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        rides: true,
      },
    });

    if (!transaction) {
      throw new BadRequestException('Transaction not found');
    }

    if (transaction.status !== 'COMPLETED') {
      throw new BadRequestException('Only completed transactions can be refunded');
    }

    try {
      const amount = Number(transaction.amount);
      const ride = transaction.rides[0];

      // Process refund based on payment method
      if (transaction.paymentMethod === 'WALLET') {
        // Credit consumer wallet
        await this.walletService.creditBalance(
          transaction.userId,
          amount,
          `Refund for ride ${transaction.rideId}`,
          transaction.id,
        );

        // Debit driver wallet if they were paid
        if (ride?.driverId) {
          const platformCommission = amount * 0.15;
          const driverEarnings = amount - platformCommission;
          
          await this.walletService.debitBalance(
            ride.driverId,
            driverEarnings,
            `Refund deduction for ride ${transaction.rideId}`,
            transaction.id,
          );
        }
      }

      // Create refund transaction
      const refundTransaction = await this.prisma.transaction.create({
        data: {
          userId: transaction.userId,
          type: 'REFUND',
          amount: amount,
          status: 'COMPLETED',
          rideId: transaction.rideId,
          referenceId: transaction.id,
          description: `Refund: ${reason}`,
        },
      });

      // Update original transaction status
      await this.prisma.transaction.update({
        where: { id: transactionId },
        data: { status: 'REFUNDED' },
      });

      this.logger.log(`Refund processed for transaction ${transactionId}`);
      return refundTransaction;
    } catch (error) {
      this.logger.error(`Refund failed for transaction ${transactionId}:`, error);
      throw error;
    }
  }

  async getPaymentHistory(userId: string, limit: number = 50) {
    return this.prisma.transaction.findMany({
      where: { 
        userId,
        type: { in: ['RIDE_PAYMENT', 'INTERCITY_PAYMENT', 'REFUND'] },
      },
      include: {
        rides: {
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

  async getPaymentById(transactionId: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        rides: true,
      },
    });

    if (!transaction) {
      throw new BadRequestException('Transaction not found');
    }

    return transaction;
  }
}
