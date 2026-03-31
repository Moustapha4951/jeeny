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

    const totalFares = rides.reduce((sum, ride) => sum + Number(ride.finalFare || 0), 0);
    const totalRides = rides.length;
    const platformCommission = totalFares * 0.15; // 15% platform fee
    const driverEarnings = totalFares - platformCommission;

    return {
      driverId,
      period: { startDate, endDate },
      totalRides,
      totalFares,
      platformCommission,
      driverEarnings,
    };
  }

  async createPayout(driverId: string, amount: number, adminId: string) {
    // Check driver wallet balance
    const wallet = await this.walletService.getWallet(driverId);
    
    if (Number(wallet.balance) < amount) {
      throw new BadRequestException('Insufficient balance for payout');
    }

    // Create transaction for payout
    const transaction = await this.prisma.transaction.create({
      data: {
        userId: driverId,
        type: 'DRIVER_PAYOUT',
        amount,
        status: 'PENDING',
        description: `Driver payout request`,
      },
    });

    // Create payout record
    const payout = await this.prisma.driverPayout.create({
      data: {
        driverId,
        transactionId: transaction.id,
        amount,
        periodStart: new Date(),
        periodEnd: new Date(),
        totalRides: 0,
        grossEarnings: amount,
        commission: 0,
        method: 'BANK_TRANSFER',
        status: 'PENDING',
        processedById: adminId,
      },
    });

    this.logger.log(`Payout created for driver ${driverId}: ${amount} MRU`);
    return payout;
  }

  async processPayout(payoutId: string, adminId: string) {
    const payout = await this.prisma.driverPayout.findUnique({
      where: { id: payoutId },
      include: { transaction: true },
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
        Number(payout.amount),
        `Payout ${payoutId}`,
        payoutId,
      );

      // Update transaction status
      await this.prisma.transaction.update({
        where: { id: payout.transactionId },
        data: { status: 'COMPLETED', processedAt: new Date(), processedById: adminId },
      });

      // Update payout status
      const updatedPayout = await this.prisma.driverPayout.update({
        where: { id: payoutId },
        data: {
          status: 'COMPLETED',
          processedAt: new Date(),
          processedById: adminId,
        },
      });

      this.logger.log(`Payout ${payoutId} processed successfully`);
      return updatedPayout;
    } catch (error) {
      this.logger.error(`Payout ${payoutId} processing failed:`, error);
      
      await this.prisma.driverPayout.update({
        where: { id: payoutId },
        data: { status: 'FAILED' },
      });

      throw error;
    }
  }

  async getDriverPayouts(driverId: string) {
    return this.prisma.driverPayout.findMany({
      where: { driverId },
      include: { transaction: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPendingPayouts() {
    return this.prisma.driverPayout.findMany({
      where: { status: 'PENDING' },
      include: {
        driver: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
