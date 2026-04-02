import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DriverGateway } from '../driver/driver.gateway';

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => DriverGateway))
    private driverGateway: DriverGateway,
  ) {}

  async getWallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  async creditBalance(
    userId: string,
    amount: number,
    description: string,
    referenceId?: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Update wallet balance
      const wallet = await tx.wallet.update({
        where: { userId },
        data: {
          balance: {
            increment: amount,
          },
        },
      });

      // Create transaction record
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type: 'WALLET_TOPUP',
          amount,
          status: 'COMPLETED',
          description,
          referenceId,
        },
      });

      return wallet;
    });

    // Emit WebSocket event for wallet update
    await this.driverGateway.sendWalletUpdate(userId);

    return result;
  }

  async debitBalance(
    userId: string,
    amount: number,
    description: string,
    referenceId?: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Get current wallet
      const currentWallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!currentWallet) {
        throw new NotFoundException('Wallet not found');
      }

      // Check sufficient balance
      if (Number(currentWallet.balance) < amount) {
        throw new BadRequestException('Insufficient balance');
      }

      // Update wallet balance
      const wallet = await tx.wallet.update({
        where: { userId },
        data: {
          balance: {
            decrement: amount,
          },
        },
      });

      // Create transaction record
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type: 'WALLET_WITHDRAWAL',
          amount,
          status: 'COMPLETED',
          description,
          referenceId,
        },
      });

      return wallet;
    });

    // Emit WebSocket event for wallet update
    await this.driverGateway.sendWalletUpdate(userId);

    return result;
  }

  async holdBalance(userId: string, amount: number, referenceId: string) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    return this.prisma.$transaction(async (tx) => {
      // Get current wallet
      const currentWallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!currentWallet) {
        throw new NotFoundException('Wallet not found');
      }

      // Check sufficient balance
      if (Number(currentWallet.balance) < amount) {
        throw new BadRequestException('Insufficient balance');
      }

      // Update wallet with hold
      const wallet = await tx.wallet.update({
        where: { userId },
        data: {
          balance: {
            decrement: amount,
          },
          holdBalance: {
            increment: amount,
          },
        },
      });

      // Create transaction record for the hold
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type: 'RIDE_PAYMENT',
          amount,
          status: 'PENDING',
          description: 'Payment hold',
          referenceId,
        },
      });

      return wallet;
    });
  }

  async releaseHold(userId: string, referenceId: string, capture: boolean = false) {
    return this.prisma.$transaction(async (tx) => {
      // Find the wallet
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      // Find the pending transaction
      const transaction = await tx.transaction.findFirst({
        where: {
          walletId: wallet.id,
          referenceId,
          status: 'PENDING',
        },
      });

      if (!transaction) {
        throw new NotFoundException('Hold not found');
      }

      const amount = Number(transaction.amount);

      if (capture) {
        // Capture the hold (deduct from held balance)
        await tx.wallet.update({
          where: { userId },
          data: {
            holdBalance: {
              decrement: amount,
            },
          },
        });

        // Update transaction status
        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'COMPLETED',
            processedAt: new Date(),
          },
        });
      } else {
        // Release the hold (return to available balance)
        await tx.wallet.update({
          where: { userId },
          data: {
            balance: {
              increment: amount,
            },
            holdBalance: {
              decrement: amount,
            },
          },
        });

        // Update transaction status
        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'CANCELLED',
            processedAt: new Date(),
          },
        });
      }

      return tx.wallet.findUnique({ where: { userId } });
    });
  }

  async getTransactionHistory(userId: string, limit: number = 50) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return this.prisma.transaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getBalance(userId: string) {
    const wallet = await this.getWallet(userId);
    return {
      balance: wallet.balance,
      heldBalance: wallet.holdBalance,
      availableBalance: wallet.balance,
      currency: wallet.currency,
    };
  }
}
