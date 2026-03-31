import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private prisma: PrismaService,
    private walletService: WalletService,
  ) {}

  async calculateDriverEarnings(driverId: string, startDate: Date, endDate: Date) {
    const rides = await this.prisma.ride.findMany({
      where: {
        driverId,
        status: 'COMPLETED',
        completedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const totalEarnings = rides.reduce((sum, ride) => sum + (ride.driverEarnings || 0), 0);
    const totalRides = rides.length;
    const platformFees = rides.reduce((sum, ride) => sum + (ride.platformFee || 0), 0);

    return {
      driverId,
      period: { startDate, endDate },
      totalRides,
      totalEarnings,
      platformFees,
      netEarnings: totalEarnings,
    };
  }

  async createPayout(driverId: string, amount: number, adminId: string) {
    // Check driver wallet balance
    const wallet = await this.walletService.getWallet(driverId);
    
    if (wallet.balance < amount) {
      throw new BadRequestException('Insufficient balance for payout');
    }

    // Create payout record
    const payout = await this.prisma.payout.create({
      data: {
        driverId,
        amount,
        status: 'PENDING',
        requestedBy: adminId,
      },
    });

    this.logger.log(`Payout created for driver ${driverId}: ${amount} MRU`);
    return payout;
  }

  async processPayout(payoutId: string, adminId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });

    if (!payout) {
      throw new BadRequestException('Payout not found');
    }

    if (payout.status !== 'PENDING') {
      throw new BadRequestException('Payout already processed');
    }

    try {
      // Debit driver wallet
      await this.walletService.debitBalance(
        payout.driverId,
        payout.amount,
        `Payout ${payoutId}`,
        payoutId,
      );

      // Update payout status
      const updatedPayout = await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: 'COMPLETED',
          processedAt: new Date(),
          processedBy: adminId,
        },
      });

      this.logger.log(`Payout ${payoutId} processed successfully`);
      return updatedPayout;
    } catch (error) {
      this.logger.error(`Payout ${payoutId} processing failed:`, error);
      
      await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: 'FAILED',
          failureReason: error.message,
        },
      });

      throw error;
    }
  }

  async getDriverPayouts(driverId: string) {
    return this.prisma.payout.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPendingPayouts() {
    return this.prisma.payout.findMany({
      where: { status: 'PENDING' },
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
