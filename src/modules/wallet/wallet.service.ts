import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

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

    return this.prisma.$transaction(async (tx) => {
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
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'CREDIT',
          amount,
          balanceAfter: wallet.balance,
          description,
          referenceId,
        },
      });

      return wallet;
    });
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

    return this.prisma.$transaction(async (tx) => {
      // Get current wallet
      const currentWallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!currentWallet) {
        throw new NotFoundException('Wallet not found');
      }

      // Check sufficient balance
      if (currentWallet.balance < amount) {
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
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEBIT',
          amount,
          balanceAfter: wallet.balance,
          description,
          referenceId,
        },
      });

      return wallet;
    });
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
      if (currentWallet.balance < amount) {
        throw new BadRequestException('Insufficient balance');
      }

      // Update wallet with hold
      const wallet = await tx.wallet.update({
        where: { userId },
        data: {
          balance: {
            decrement: amount,
          },
          heldBalance: {
            increment: amount,
          },
        },
      });

      // Create hold record
      await tx.walletHold.create({
        data: {
          walletId: wallet.id,
          amount,
          referenceId,
          status: 'ACTIVE',
        },
      });

      return wallet;
    });
  }

  async releaseHold(userId: string, referenceId: string, capture: boolean = false) {
    return this.prisma.$transaction(async (tx) => {
      // Find the hold
      const wallet = await tx.wallet.findUnique({
        where: { userId },
        include: {
          holds: {
            where: {
              referenceId,
              status: 'ACTIVE',
            },
          },
        },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      const hold = wallet.holds[0];
      if (!hold) {
        throw new NotFoundException('Hold not found');
      }

      if (capture) {
        // Capture the hold (deduct from held balance)
        await tx.wallet.update({
          where: { userId },
          data: {
            heldBalance: {
              decrement: hold.amount,
            },
          },
        });

        // Create transaction record
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'DEBIT',
            amount: hold.amount,
            balanceAfter: wallet.balance,
            description: 'Payment captured from hold',
            referenceId,
          },
        });
      } else {
        // Release the hold (return to available balance)
        await tx.wallet.update({
          where: { userId },
          data: {
            balance: {
              increment: hold.amount,
            },
            heldBalance: {
              decrement: hold.amount,
            },
          },
        });
      }

      // Update hold status
      await tx.walletHold.update({
        where: { id: hold.id },
        data: {
          status: capture ? 'CAPTURED' : 'RELEASED',
        },
      });

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

    return this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getBalance(userId: string) {
    const wallet = await this.getWallet(userId);
    return {
      balance: wallet.balance,
      heldBalance: wallet.heldBalance,
      availableBalance: wallet.balance,
      currency: wallet.currency,
    };
  }
}
