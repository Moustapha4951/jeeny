import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { DriverGateway } from '../driver/driver.gateway';
import { EmployerGateway } from './employer.gateway';

@Injectable()
export class SupportService {
  constructor(
    private prisma: PrismaService,
    private walletService: WalletService,
    @Inject(forwardRef(() => DriverGateway))
    private driverGateway: DriverGateway,
    @Inject(forwardRef(() => EmployerGateway))
    private employerGateway: EmployerGateway,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  //  Conversation helpers
  // ─────────────────────────────────────────────────────────────────────────

  async getOrCreateSupportConversation(driverUserId: string) {
    const existing = await this.prisma.conversation.findFirst({
      where: { type: 'SUPPORT' as any, participant1Id: driverUserId },
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        type: 'SUPPORT' as any,
        participant1Id: driverUserId,
        isActive: true,
      },
    });
  }

  async getMessages(conversationId: string, limit = 100) {
    return this.prisma.chatMessage.findMany({
      where: { conversationId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async getAllConversations() {
    const conversations = await this.prisma.conversation.findMany({
      where: { type: 'SUPPORT' as any },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    return Promise.all(
      conversations.map(async (conv) => {
        const [user, driver, wallet, unreadCount] = await Promise.all([
          this.prisma.user.findUnique({
            where: { id: conv.participant1Id },
            select: { firstName: true, lastName: true, phone: true },
          }),
          this.prisma.driver.findUnique({
            where: { userId: conv.participant1Id },
            select: { id: true, rating: true, totalTrips: true, isOnline: true },
          }),
          this.prisma.wallet.findUnique({
            where: { userId: conv.participant1Id },
            select: { balance: true },
          }),
          this.prisma.chatMessage.count({
            where: {
              conversationId: conv.id,
              senderType: 'DRIVER' as any,
              status: { in: ['SENT', 'DELIVERED'] },
            },
          }),
        ]);

        return {
          id: conv.id,
          driverUserId: conv.participant1Id,
          driverId: driver?.id,
          driverName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'سائق',
          driverPhone: user?.phone ?? '',
          driverRating: driver?.rating ? Number(driver.rating) : 0,
          driverTotalTrips: driver?.totalTrips ?? 0,
          isDriverOnline: driver?.isOnline ?? false,
          walletBalance: wallet?.balance ? Number(wallet.balance) : 0,
          lastMessage: conv.messages[0] ?? null,
          unreadCount,
          updatedAt: conv.updatedAt,
        };
      }),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Messaging
  // ─────────────────────────────────────────────────────────────────────────

  async saveMessage(
    conversationId: string,
    senderId: string,
    senderType: 'DRIVER' | 'SUPPORT' | 'SYSTEM',
    content: string,
  ) {
    const message = await this.prisma.chatMessage.create({
      data: {
        conversationId,
        senderId,
        senderType: senderType as any,
        messageType: 'TEXT',
        content,
        status: 'SENT',
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  /** Driver sends a message → save + push to all employers */
  async handleDriverMessage(driverUserId: string, content: string) {
    const conv = await this.getOrCreateSupportConversation(driverUserId);
    const message = await this.saveMessage(conv.id, driverUserId, 'DRIVER', content);

    const serialized = this.serializeMessage(message, conv.id);

    // Echo to the driver's own socket
    const driver = await this.prisma.driver.findUnique({
      where: { userId: driverUserId },
      select: { id: true },
    });
    if (driver) {
      this.driverGateway.server.to(driver.id).emit('support:message', serialized);
    }

    // Push to all connected employers
    const user = await this.prisma.user.findUnique({
      where: { id: driverUserId },
      select: { firstName: true, lastName: true, phone: true },
    });
    this.employerGateway.server.emit('support:message', {
      ...serialized,
      driverUserId,
      driverName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'سائق',
      driverPhone: user?.phone ?? '',
    });

    return { message: serialized, conversationId: conv.id };
  }

  /** Employer sends a message → save + push to the driver */
  async handleEmployerMessage(
    driverUserId: string,
    content: string,
    employerUserId: string,
  ) {
    const conv = await this.getOrCreateSupportConversation(driverUserId);
    const message = await this.saveMessage(conv.id, employerUserId, 'SUPPORT', content);
    const serialized = this.serializeMessage(message, conv.id);

    // Push to the driver
    const driver = await this.prisma.driver.findUnique({
      where: { userId: driverUserId },
      select: { id: true },
    });
    if (driver) {
      this.driverGateway.server.to(driver.id).emit('support:message', serialized);
    }

    return { message: serialized, conversationId: conv.id };
  }

  /** Employer recharges a driver's wallet → credit + system message */
  async rechargeBalance(
    driverUserId: string,
    amount: number,
    note: string,
    employerUserId: string,
  ) {
    await this.walletService.creditBalance(
      driverUserId,
      amount,
      note || `شحن رصيد بمبلغ ${amount} أوقية`,
    );

    const conv = await this.getOrCreateSupportConversation(driverUserId);
    const systemMsg = await this.saveMessage(
      conv.id,
      employerUserId,
      'SYSTEM',
      `✅ تم شحن رصيدك بمبلغ ${amount} أوقية`,
    );
    const serialized = this.serializeMessage(systemMsg, conv.id);

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: driverUserId },
      select: { balance: true },
    });

    // Push system message to driver (wallet:update is sent by WalletService via DriverGateway)
    const driver = await this.prisma.driver.findUnique({
      where: { userId: driverUserId },
      select: { id: true },
    });
    if (driver) {
      this.driverGateway.server.to(driver.id).emit('support:message', serialized);
    }

    return {
      message: serialized,
      conversationId: conv.id,
      newBalance: wallet?.balance ? Number(wallet.balance) : 0,
    };
  }

  /** Mark all unread driver messages in a conversation as READ */
  async markDriverMessagesRead(conversationId: string) {
    return this.prisma.chatMessage.updateMany({
      where: {
        conversationId,
        senderType: 'DRIVER' as any,
        status: { in: ['SENT', 'DELIVERED'] },
      },
      data: { status: 'READ', readAt: new Date(), deliveredAt: new Date() },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private serializeMessage(msg: any, conversationId: string) {
    return {
      ...msg,
      createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
      updatedAt: msg.updatedAt instanceof Date ? msg.updatedAt.toISOString() : msg.updatedAt,
      conversationId,
    };
  }
}
