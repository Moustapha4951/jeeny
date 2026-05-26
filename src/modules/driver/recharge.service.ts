import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  RechargeMessageKind,
  RechargeMessageSender,
  RechargeMethod,
  RechargeRequestStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FirebaseService } from '../../firebase/firebase.service';

/**
 * Driver wallet recharge / top-up flow.
 *
 * The driver creates a request (amount + method), the system seeds the
 * conversation with a "how much" prompt and the payment instructions
 * (Bankily / Sedad / Masrvi numbers), the driver sends a screenshot, and
 * an employee reviews and approves or rejects.
 *
 * On approve we credit the wallet via a single transaction so the balance
 * and the transaction record stay in sync.
 */
@Injectable()
export class RechargeService {
  /**
   * Operator phone numbers shown to the driver for each payment method.
   * These should ultimately come from SystemSetting so finance can change
   * them without redeploying, but for v1 we hard-code them.
   */
  private readonly paymentNumbers: Record<RechargeMethod, string> = {
    BANKILY: '24212422',
    SEDAD: '24212422',
    MASRVI: '24212422',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  // ─── Driver-facing API ──────────────────────────────────────────────────

  /**
   * Open a new recharge request. Seeds the chat with two system messages:
   *   1. The amount the driver chose
   *   2. The payment-method instructions
   */
  async createRequest(driverUserId: string, amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('المبلغ غير صالح');
    }

    const driver = await this.prisma.driver.findUnique({
      where: { userId: driverUserId },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Block creating a second request while one is already mid-flight.
    const existing = await this.prisma.rechargeRequest.findFirst({
      where: {
        driverId: driver.id,
        status: { in: ['PENDING_PAYMENT', 'AWAITING_REVIEW'] },
      },
    });
    if (existing) {
      return this.findOneForDriver(driverUserId, existing.id);
    }

    const request = await this.prisma.rechargeRequest.create({
      data: {
        driverId: driver.id,
        amount,
        status: 'PENDING_PAYMENT',
      },
    });

    // Seed the chat:
    //   • "Hello, how much would you like to recharge?" (TEXT)
    //   • "You chose X MRU" (AMOUNT_PROPOSAL)
    //   • Payment methods list (METHOD_LIST)
    await this.prisma.rechargeMessage.createMany({
      data: [
        {
          requestId: request.id,
          sender: 'SYSTEM',
          kind: 'TEXT',
          body: 'مرحباً 👋 سنساعدك في شحن محفظتك.',
        },
        {
          requestId: request.id,
          sender: 'SYSTEM',
          kind: 'AMOUNT_PROPOSAL',
          body: `تم اختيار ${amount.toFixed(0)} أوقية`,
          metadata: { amount },
        },
        {
          requestId: request.id,
          sender: 'SYSTEM',
          kind: 'METHOD_LIST',
          body: 'اختر طريقة الدفع المناسبة لك ثم أرسل لقطة شاشة لتأكيد التحويل',
          metadata: {
            methods: [
              { id: 'BANKILY', name: 'بنكيلي', number: this.paymentNumbers.BANKILY },
              { id: 'SEDAD', name: 'سداد', number: this.paymentNumbers.SEDAD },
              { id: 'MASRVI', name: 'مصرفي', number: this.paymentNumbers.MASRVI },
            ],
          },
        },
      ],
    });

    // Notify FINANCE / OPERATIONS employees that a fresh request landed.
    await this.pushToEmployee(
      request.id,
      'طلب شحن جديد',
      `طلب جديد بقيمة ${amount.toFixed(0)} MRU`,
    );

    return this.findOneForDriver(driverUserId, request.id);
  }

  /** Driver lists their own recharge requests, newest first. */
  async listForDriver(driverUserId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId: driverUserId },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    return this.prisma.rechargeRequest.findMany({
      where: { driverId: driver.id },
      orderBy: { createdAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 1 },
      },
    });
  }

  async findOneForDriver(driverUserId: string, requestId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId: driverUserId },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    const request = await this.prisma.rechargeRequest.findFirst({
      where: { id: requestId, driverId: driver.id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        // Surface the assigned employee so the driver can call them.
        assignedEmployee: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                avatar: true,
              },
            },
          },
        },
      },
    });
    if (!request) {
      throw new NotFoundException('Recharge request not found');
    }
    return request;
  }

  /**
   * Driver chooses a payment method. Bumps the request to AWAITING_REVIEW
   * once they also send a screenshot, but for now this just records the
   * method on the row and posts a confirmation message.
   */
  async setMethod(
    driverUserId: string,
    requestId: string,
    method: RechargeMethod,
  ) {
    const request = await this.findOneForDriver(driverUserId, requestId);
    if (request.status !== 'PENDING_PAYMENT') {
      throw new BadRequestException('لا يمكن تغيير طريقة الدفع الآن');
    }
    await this.prisma.rechargeRequest.update({
      where: { id: request.id },
      data: { method },
    });
    await this.prisma.rechargeMessage.create({
      data: {
        requestId: request.id,
        sender: 'DRIVER',
        senderUserId: driverUserId,
        kind: 'TEXT',
        body: `سأدفع عبر ${this.methodLabel(method)} على الرقم ${this.paymentNumbers[method]}`,
        metadata: { method },
      },
    });
    return this.findOneForDriver(driverUserId, requestId);
  }

  /**
   * Driver posts a message — typically a screenshot of the transfer or
   * a short voice note.
   * If the message has an image and the request is still PENDING_PAYMENT
   * it auto-flips to AWAITING_REVIEW so the employee queue picks it up.
   */
  async sendDriverMessage(
    driverUserId: string,
    requestId: string,
    body: string | undefined,
    imageUrl: string | undefined,
    audioUrl?: string,
    audioDurationMs?: number,
  ) {
    const request = await this.findOneForDriver(driverUserId, requestId);
    if (
      request.status !== 'PENDING_PAYMENT' &&
      request.status !== 'AWAITING_REVIEW'
    ) {
      throw new BadRequestException('لا يمكن إرسال رسائل لطلب مغلق');
    }
    if (!body && !imageUrl && !audioUrl) {
      throw new BadRequestException('الرسالة فارغة');
    }
    const kind: RechargeMessageKind = audioUrl
      ? 'AUDIO'
      : imageUrl
        ? 'IMAGE'
        : 'TEXT';
    const message = await this.prisma.rechargeMessage.create({
      data: {
        requestId: request.id,
        sender: 'DRIVER',
        senderUserId: driverUserId,
        kind,
        body,
        imageUrl,
        audioUrl,
        audioDurationMs,
      },
    });
    if (imageUrl && request.status === 'PENDING_PAYMENT') {
      await this.prisma.rechargeRequest.update({
        where: { id: request.id },
        data: { status: 'AWAITING_REVIEW' },
      });
    }
    // Push to the employee side so they hear about the new message.
    await this.pushToEmployee(
      request.id,
      'رسالة من سائق',
      audioUrl
        ? 'رسالة صوتية'
        : imageUrl
          ? 'أرسل لقطة شاشة للتحويل'
          : (body ?? ''),
    );
    return message;
  }

  /** Driver cancels their request before approval. */
  async cancelByDriver(driverUserId: string, requestId: string) {
    const request = await this.findOneForDriver(driverUserId, requestId);
    if (request.status === 'APPROVED' || request.status === 'REJECTED') {
      throw new BadRequestException('لا يمكن إلغاء طلب مكتمل');
    }
    await this.prisma.rechargeRequest.update({
      where: { id: request.id },
      data: { status: 'CANCELLED', reviewedAt: new Date() },
    });
    await this.prisma.rechargeMessage.create({
      data: {
        requestId: request.id,
        sender: 'SYSTEM',
        kind: 'STATUS_UPDATE',
        body: 'تم إلغاء الطلب من قبل السائق',
        metadata: { status: 'CANCELLED' },
      },
    });
    return this.findOneForDriver(driverUserId, requestId);
  }

  // ─── Employee-facing API ────────────────────────────────────────────────

  /**
   * Lists requests for the employee app. Filters:
   *   - status: ALL / pending review / approved / rejected
   */
  async listForEmployee(filters: {
    status?: RechargeRequestStatus | 'ALL';
    take?: number;
    skip?: number;
  }) {
    const status = filters.status && filters.status !== 'ALL'
      ? filters.status
      : undefined;
    return this.prisma.rechargeRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: [
        // pending → review → recent first
        { status: 'asc' },
        { createdAt: 'desc' },
      ],
      take: filters.take ?? 50,
      skip: filters.skip ?? 0,
      include: {
        driver: {
          include: {
            user: {
              select: { firstName: true, lastName: true, phone: true, avatar: true },
            },
          },
        },
      },
    });
  }

  async findOneForEmployee(requestId: string) {
    const request = await this.prisma.rechargeRequest.findUnique({
      where: { id: requestId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        driver: {
          include: {
            user: {
              select: { firstName: true, lastName: true, phone: true, avatar: true },
            },
          },
        },
      },
    });
    if (!request) {
      throw new NotFoundException('Recharge request not found');
    }
    return request;
  }

  async sendEmployeeMessage(
    employeeId: string,
    employeeUserId: string,
    requestId: string,
    body: string | undefined,
    imageUrl: string | undefined,
    audioUrl?: string,
    audioDurationMs?: number,
  ) {
    const request = await this.findOneForEmployee(requestId);
    if (request.status === 'APPROVED' || request.status === 'REJECTED' || request.status === 'CANCELLED') {
      throw new BadRequestException('Request is closed');
    }
    if (!body && !imageUrl && !audioUrl) {
      throw new BadRequestException('Empty message');
    }
    // Soft-claim the request to this employee
    if (!request.assignedEmployeeId) {
      await this.prisma.rechargeRequest.update({
        where: { id: request.id },
        data: { assignedEmployeeId: employeeId },
      });
    }
    const kind: RechargeMessageKind = audioUrl
      ? 'AUDIO'
      : imageUrl
        ? 'IMAGE'
        : 'TEXT';
    const message = await this.prisma.rechargeMessage.create({
      data: {
        requestId: request.id,
        sender: 'EMPLOYEE',
        senderUserId: employeeUserId,
        kind,
        body,
        imageUrl,
        audioUrl,
        audioDurationMs,
      },
    });
    await this.pushToDriver(
      request.id,
      'رد من مسار',
      audioUrl
        ? 'رسالة صوتية'
        : imageUrl
          ? 'صورة جديدة'
          : (body ?? ''),
    );
    return message;
  }

  /**
   * Approve a request → credit the driver's wallet, log a BONUS transaction,
   * post a system "approved" message, close the request.
   */
  async approve(employeeId: string, requestId: string) {
    const request = await this.findOneForEmployee(requestId);
    if (request.status === 'APPROVED') {
      return this.findOneForEmployee(requestId);
    }
    if (request.status === 'REJECTED' || request.status === 'CANCELLED') {
      throw new BadRequestException('Request is closed');
    }

    const driver = await this.prisma.driver.findUnique({
      where: { id: request.driverId },
      include: { user: { include: { wallet: true } } },
    });
    if (!driver?.user.wallet) {
      throw new BadRequestException('Driver has no wallet');
    }

    const amount = Number(request.amount);

    await this.prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: driver.user.wallet!.id },
        data: { balance: { increment: amount } },
      });
      const txn = await tx.transaction.create({
        data: {
          walletId: driver.user.wallet!.id,
          userId: driver.userId,
          type: 'WALLET_TOPUP',
          amount,
          status: 'COMPLETED',
          description: `Manual recharge approved (request ${request.id.slice(0, 8)})`,
          descriptionAr: `شحن يدوي للمحفظة (طلب ${request.id.slice(0, 8)})`,
        },
      });
      await tx.rechargeRequest.update({
        where: { id: request.id },
        data: {
          status: 'APPROVED',
          assignedEmployeeId: employeeId,
          reviewedAt: new Date(),
          transactionId: txn.id,
        },
      });
      await tx.rechargeMessage.create({
        data: {
          requestId: request.id,
          sender: 'SYSTEM',
          kind: 'STATUS_UPDATE',
          body: `تم اعتماد طلبك ✅ تم شحن ${amount.toFixed(0)} أوقية على محفظتك`,
          metadata: { status: 'APPROVED', amount, transactionId: txn.id },
        },
      });
    });

    // Push to driver — this should buzz them like a balance update.
    await this.pushToDriver(
      requestId,
      'تم اعتماد الشحن ✅',
      `أُضيف ${amount.toFixed(0)} MRU إلى محفظتك`,
    );

    return this.findOneForEmployee(requestId);
  }

  async reject(employeeId: string, requestId: string, reason: string) {
    const request = await this.findOneForEmployee(requestId);
    if (request.status === 'APPROVED' || request.status === 'REJECTED') {
      throw new BadRequestException('Request is already closed');
    }
    await this.prisma.rechargeRequest.update({
      where: { id: request.id },
      data: {
        status: 'REJECTED',
        assignedEmployeeId: employeeId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });
    await this.prisma.rechargeMessage.create({
      data: {
        requestId: request.id,
        sender: 'SYSTEM',
        kind: 'STATUS_UPDATE',
        body: reason
          ? `تم رفض الطلب ❌ السبب: ${reason}`
          : 'تم رفض الطلب ❌',
        metadata: { status: 'REJECTED', reason },
      },
    });
    await this.pushToDriver(
      requestId,
      'تم رفض طلب الشحن',
      reason || 'الرجاء التواصل لمعرفة السبب',
    );
    return this.findOneForEmployee(requestId);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private methodLabel(method: RechargeMethod): string {
    switch (method) {
      case 'BANKILY':
        return 'بنكيلي';
      case 'SEDAD':
        return 'سداد';
      case 'MASRVI':
        return 'مصرفي';
    }
  }

  /**
   * Push the given title/body to the driver who owns the request and to
   * any employee already assigned to it. We swallow errors so a missing
   * FCM token never blocks the actual chat operation.
   */
  private async pushToDriver(
    requestId: string,
    title: string,
    body: string,
    extra: Record<string, string> = {},
  ) {
    try {
      const request = await this.prisma.rechargeRequest.findUnique({
        where: { id: requestId },
        include: {
          driver: { include: { user: { select: { fcmToken: true } } } },
        },
      });
      const token = request?.driver?.user?.fcmToken;
      if (!token) return;
      await this.firebase.sendNotification(token, title, body, {
        type: 'RECHARGE_MESSAGE',
        requestId,
        ...extra,
      });
    } catch (e) {
      // ignore
    }
  }

  private async pushToEmployee(
    requestId: string,
    title: string,
    body: string,
    extra: Record<string, string> = {},
  ) {
    try {
      const request = await this.prisma.rechargeRequest.findUnique({
        where: { id: requestId },
        include: {
          assignedEmployee: {
            include: { user: { select: { fcmToken: true } } },
          },
        },
      });
      const tokens: string[] = [];
      const direct = request?.assignedEmployee?.user?.fcmToken;
      if (direct) tokens.push(direct);
      // If unassigned, fan out to any FINANCE / OPERATIONS employee with a
      // token so somebody picks it up.
      if (!direct) {
        const candidates = await this.prisma.employee.findMany({
          where: {
            role: { in: ['FINANCE', 'OPERATIONS'] },
            user: { fcmToken: { not: null } },
          },
          include: { user: { select: { fcmToken: true } } },
        });
        for (const c of candidates) {
          if (c.user.fcmToken) tokens.push(c.user.fcmToken);
        }
      }
      if (tokens.length === 0) return;
      const data: Record<string, string> = {
        type: 'RECHARGE_MESSAGE',
        requestId,
        ...extra,
      };
      // sendMulticast lives on FirebaseService; use it when we have >1 token
      if (tokens.length === 1) {
        await this.firebase.sendNotification(tokens[0], title, body, data);
      } else {
        await this.firebase.sendMulticast(tokens, title, body, data);
      }
    } catch (e) {
      // ignore
    }
  }
}
