import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DriverGateway } from '../driver/driver.gateway';
import { EmployerGateway } from '../support/employer.gateway';

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => DriverGateway))
    private driverGateway: DriverGateway,
    @Inject(forwardRef(() => EmployerGateway))
    private employerGateway: EmployerGateway,
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
      const wallet = await tx.wallet.update({
        where: { userId },
        data: { balance: { increment: amount } },
      });

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
      const currentWallet = await tx.wallet.findUnique({ where: { userId } });
      if (!currentWallet) throw new NotFoundException('Wallet not found');
      if (Number(currentWallet.balance) < amount)
        throw new BadRequestException('Insufficient balance');

      const wallet = await tx.wallet.update({
        where: { userId },
        data: { balance: { decrement: amount } },
      });

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

    await this.driverGateway.sendWalletUpdate(userId);
    return result;
  }

  async holdBalance(userId: string, amount: number, referenceId: string) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    return this.prisma.$transaction(async (tx) => {
      const currentWallet = await tx.wallet.findUnique({ where: { userId } });
      if (!currentWallet) throw new NotFoundException('Wallet not found');
      if (Number(currentWallet.balance) < amount)
        throw new BadRequestException('Insufficient balance');

      const wallet = await tx.wallet.update({
        where: { userId },
        data: {
          balance: { decrement: amount },
          holdBalance: { increment: amount },
        },
      });

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

  async releaseHold(
    userId: string,
    referenceId: string,
    capture: boolean = false,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new NotFoundException('Wallet not found');

      const transaction = await tx.transaction.findFirst({
        where: { walletId: wallet.id, referenceId, status: 'PENDING' },
      });
      if (!transaction) throw new NotFoundException('Hold not found');

      const amount = Number(transaction.amount);

      if (capture) {
        await tx.wallet.update({
          where: { userId },
          data: { holdBalance: { decrement: amount } },
        });
        await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: 'COMPLETED', processedAt: new Date() },
        });
      } else {
        await tx.wallet.update({
          where: { userId },
          data: {
            balance: { increment: amount },
            holdBalance: { decrement: amount },
          },
        });
        await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: 'CANCELLED', processedAt: new Date() },
        });
      }

      return tx.wallet.findUnique({ where: { userId } });
    });
  }

  async getTransactionHistory(userId: string, limit: number = 50) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

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

  // ─── Recharge Requests ─────────────────────────────────────────────────────

  async createRechargeRequest(
    driverUserId: string,
    amount: number,
    screenshotUrl?: string,
  ) {
    if (!amount || amount <= 0)
      throw new BadRequestException('Amount must be positive');

    const driver = await this.prisma.driver.findUnique({
      where: { userId: driverUserId },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    const user = await this.prisma.user.findUnique({
      where: { id: driverUserId },
      select: { firstName: true, lastName: true, phone: true },
    });

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: driverUserId },
      select: { balance: true },
    });

    const request = await this.prisma.rechargeRequest.create({
      data: { driverUserId, amount, screenshotUrl },
    });

    const payload = {
      id: request.id,
      driverUserId,
      driverId: driver.id,
      driverName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
      driverPhone: user?.phone,
      walletBalance: Number(wallet?.balance ?? 0),
      amount: Number(request.amount),
      screenshotUrl: request.screenshotUrl,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
    };

    // Notify all connected employers in real-time
    try {
      this.employerGateway.server.emit('recharge:new_request', payload);
    } catch (_) {}

    return { success: true, request: payload };
  }

  async getRechargeRequests(status?: string) {
    const requests = await this.prisma.rechargeRequest.findMany({
      where: status ? { status: status as any } : {},
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    return Promise.all(
      requests.map(async (req) => {
        const user = await this.prisma.user.findUnique({
          where: { id: req.driverUserId },
          select: { firstName: true, lastName: true, phone: true },
        });
        const driver = await this.prisma.driver.findUnique({
          where: { userId: req.driverUserId },
          select: { id: true },
        });
        const wallet = await this.prisma.wallet.findUnique({
          where: { userId: req.driverUserId },
          select: { balance: true },
        });
        return {
          ...req,
          amount: Number(req.amount),
          driverName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
          driverPhone: user?.phone,
          driverId: driver?.id,
          walletBalance: Number(wallet?.balance ?? 0),
        };
      }),
    );
  }

  async getMyRechargeRequests(driverUserId: string) {
    return this.prisma.rechargeRequest.findMany({
      where: { driverUserId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        amount: true,
        screenshotUrl: true,
        status: true,
        reviewNote: true,
        createdAt: true,
        reviewedAt: true,
      },
    });
  }

  async approveRechargeRequest(id: string, reviewerId: string) {
    const request = await this.prisma.rechargeRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'PENDING')
      throw new BadRequestException('Request is not pending');

    await this.prisma.rechargeRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });

    // Credit the driver wallet
    await this.creditBalance(
      request.driverUserId,
      Number(request.amount),
      `شحن رصيد معتمد - ${Number(request.amount)} أوقية`,
      id,
    );

    // Notify driver via WS
    const driver = await this.prisma.driver.findUnique({
      where: { userId: request.driverUserId },
      select: { id: true },
    });
    if (driver) {
      try {
        this.driverGateway.server
          .to(driver.id)
          .emit('recharge:updated', {
            requestId: id,
            status: 'APPROVED',
            amount: Number(request.amount),
          });
      } catch (_) {}
    }

    return { success: true };
  }

  async denyRechargeRequest(
    id: string,
    reviewerId: string,
    note?: string,
  ) {
    const request = await this.prisma.rechargeRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'PENDING')
      throw new BadRequestException('Request is not pending');

    await this.prisma.rechargeRequest.update({
      where: { id },
      data: {
        status: 'DENIED',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: note ?? null,
      },
    });

    const driver = await this.prisma.driver.findUnique({
      where: { userId: request.driverUserId },
      select: { id: true },
    });
    if (driver) {
      try {
        this.driverGateway.server
          .to(driver.id)
          .emit('recharge:updated', {
            requestId: id,
            status: 'DENIED',
            amount: Number(request.amount),
            note: note ?? '',
          });
      } catch (_) {}
    }

    return { success: true };
  }
}
