import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConsumerGateway } from '../consumer-gateway/consumer.gateway';
import { DriverGateway } from '../driver/driver.gateway';

/// Chat between the rider and the driver of a single ride. The
/// conversation is created lazily the first time either party opens
/// the chat. Each message gets pushed in real time over both the
/// consumer and driver WebSocket gateways so neither end has to poll.
@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private consumerGateway: ConsumerGateway,
    private driverGateway: DriverGateway,
  ) {}

  /// Returns the conversation linked to a ride, creating it on first
  /// access. Asserts the caller is one of the ride participants.
  private async getOrCreateConversation(rideId: string, userId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        consumer: { select: { userId: true } },
        driver: { select: { userId: true } },
      },
    });
    if (!ride) throw new NotFoundException('Ride not found');

    const consumerUserId = ride.consumer?.userId;
    const driverUserId = ride.driver?.userId;
    if (userId !== consumerUserId && userId !== driverUserId) {
      throw new ForbiddenException('Not a participant of this ride');
    }
    if (!consumerUserId || !driverUserId) {
      throw new BadRequestException(
        'Chat is unavailable until a driver is assigned',
      );
    }

    const existing = await this.prisma.conversation.findFirst({
      where: { rideId },
    });
    if (existing) {
      return {
        conversation: existing,
        consumerUserId,
        driverUserId,
        ride,
      };
    }
    // First-message creation. participant1 = consumer, participant2 = driver.
    const conv = await this.prisma.conversation.create({
      data: {
        type: 'RIDER',
        rideId,
        participant1Id: consumerUserId,
        participant2Id: driverUserId,
        isActive: true,
      },
    });
    return {
      conversation: conv,
      consumerUserId,
      driverUserId,
      ride,
    };
  }

  /// Get the conversation + last 50 messages (newest last). Also marks
  /// any messages the caller hasn't seen as DELIVERED.
  async getRideChat(rideId: string, userId: string) {
    const { conversation, consumerUserId, driverUserId } =
      await this.getOrCreateConversation(rideId, userId);

    const messages = await this.prisma.chatMessage.findMany({
      where: { conversationId: conversation.id, isDeleted: false },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    // Update DELIVERED status for messages received by the caller. We
    // don't auto-mark READ here — that's a separate explicit call from
    // the client when the user actually opens the chat.
    await this.prisma.chatMessage.updateMany({
      where: {
        conversationId: conversation.id,
        senderId: { not: userId },
        status: 'SENT',
      },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date(),
      },
    });

    return {
      conversationId: conversation.id,
      consumerUserId,
      driverUserId,
      messages,
    };
  }

  /// Send a text or location message and broadcast it both ways.
  async sendMessage(
    rideId: string,
    userId: string,
    body: { content?: string; messageType?: 'TEXT' | 'LOCATION'; location?: any },
  ) {
    const messageType = body.messageType ?? 'TEXT';
    const content = body.content?.trim();

    if (messageType === 'TEXT' && (!content || content.length === 0)) {
      throw new BadRequestException('Message cannot be empty');
    }
    if (messageType === 'LOCATION' && !body.location) {
      throw new BadRequestException('Location payload missing');
    }
    if (content && content.length > 2000) {
      throw new BadRequestException('Message too long (max 2000 chars)');
    }

    const { conversation, consumerUserId, driverUserId } =
      await this.getOrCreateConversation(rideId, userId);

    const senderType = userId === driverUserId ? 'DRIVER' : 'RIDER';
    const message = await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: userId,
        senderType: senderType as any,
        messageType: messageType as any,
        content: content,
        location: body.location ?? undefined,
        status: 'SENT',
      },
    });

    // Bump conversation updatedAt for sort order in any future inbox.
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    // Push to both ends. The recipient is whichever one didn't send.
    const recipientUserId =
      senderType === 'DRIVER' ? consumerUserId : driverUserId;

    const payload = {
      ...message,
      conversationId: conversation.id,
      rideId,
    };

    // Send to recipient (so they can render instantly).
    if (recipientUserId === consumerUserId) {
      this.consumerGateway.emitToUser(consumerUserId, 'chat:message', payload);
    } else {
      // Driver gateway is room-keyed by driverId, not userId. We need to
      // resolve the driver record id for the recipient.
      try {
        const driver = await this.prisma.driver.findUnique({
          where: { userId: driverUserId },
          select: { id: true },
        });
        if (driver) {
          this.driverGateway.server
            .to(driver.id)
            .emit('chat:message', payload);
        }
      } catch {/* swallow — best effort */}
    }
    // Echo back to sender as well so multi-device sessions stay in sync.
    if (senderType === 'DRIVER') {
      this.consumerGateway.emitToUser(consumerUserId, 'chat:message', payload);
    } else {
      try {
        const driver = await this.prisma.driver.findUnique({
          where: { userId: driverUserId },
          select: { id: true },
        });
        if (driver) {
          this.driverGateway.server
            .to(driver.id)
            .emit('chat:message', payload);
        }
      } catch {/* swallow */}
    }

    return message;
  }

  /// Mark all unseen messages from the other party as READ. Called when
  /// the chat screen mounts or comes back into focus.
  async markRead(rideId: string, userId: string) {
    const { conversation } = await this.getOrCreateConversation(rideId, userId);

    const result = await this.prisma.chatMessage.updateMany({
      where: {
        conversationId: conversation.id,
        senderId: { not: userId },
        status: { in: ['SENT', 'DELIVERED'] },
      },
      data: {
        status: 'READ',
        readAt: new Date(),
        deliveredAt: new Date(),
      },
    });

    return { updated: result.count };
  }

  /// Pre-built quick-reply chips. Filtered by audience.
  async getQuickReplies(audience: 'RIDER' | 'DRIVER') {
    return this.prisma.chatQuickReply.findMany({
      where: {
        isActive: true,
        OR: [{ category: audience }, { category: 'COMMON' as any }],
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /// Quick aggregate for the ride banner / inbox: count of unread msgs
  /// addressed to the caller for this ride.
  async getUnreadCount(rideId: string, userId: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: { rideId },
      select: { id: true },
    });
    if (!conv) return { unread: 0 };
    const unread = await this.prisma.chatMessage.count({
      where: {
        conversationId: conv.id,
        senderId: { not: userId },
        status: { in: ['SENT', 'DELIVERED'] },
      },
    });
    return { unread };
  }
}
