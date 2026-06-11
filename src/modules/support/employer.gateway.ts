import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SupportService } from './support.service';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/employer',
})
export class EmployerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private employerSockets = new Map<string, string>(); // userId → socketId

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    @Inject(forwardRef(() => SupportService))
    private supportService: SupportService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) { client.disconnect(); return; }

      const payload = this.jwtService.verify(token);
      const userId = payload.userId || payload.sub;
      if (!userId) { client.disconnect(); return; }

      this.employerSockets.set(userId, client.id);
      client.data.userId = userId;
      client.join(userId);

      console.log(`✅ Employer ${userId} connected to /employer WS`);
    } catch (e) {
      console.error('Employer WS auth error:', e);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      this.employerSockets.delete(userId);
      console.log(`Employer ${userId} disconnected from /employer WS`);
    }
  }

  // ─── Fetch all driver support conversations ────────────────────────────────
  @SubscribeMessage('support:get_conversations')
  async handleGetConversations(@ConnectedSocket() client: Socket) {
    const conversations = await this.supportService.getAllConversations();
    client.emit('support:conversations', conversations);
  }

  // ─── Fetch messages for a specific driver ──────────────────────────────────
  @SubscribeMessage('support:get_messages')
  async handleGetMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { driverUserId: string },
  ) {
    const conv = await this.supportService.getOrCreateSupportConversation(
      data.driverUserId,
    );
    const messages = await this.supportService.getMessages(conv.id);

    // Mark driver messages as read
    await this.supportService.markDriverMessagesRead(conv.id);

    client.emit('support:history', {
      conversationId: conv.id,
      driverUserId: data.driverUserId,
      messages: messages.map((m: any) => ({
        ...m,
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
      })),
    });
  }

  // ─── Employer sends a message to a driver ──────────────────────────────────
  @SubscribeMessage('support:send')
  async handleSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { driverUserId: string; content: string },
  ) {
    const employerUserId = client.data.userId;
    if (!employerUserId || !data.driverUserId || !data.content?.trim()) return;

    const result = await this.supportService.handleEmployerMessage(
      data.driverUserId,
      data.content.trim(),
      employerUserId,
    );

    // Echo back to the employer who sent it
    client.emit('support:message', result.message);
  }

  // ─── Recharge a driver's wallet ───────────────────────────────────────────
  @SubscribeMessage('support:recharge')
  async handleRecharge(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { driverUserId: string; amount: number; note?: string },
  ) {
    const employerUserId = client.data.userId;
    if (!employerUserId || !data.driverUserId || !data.amount) return;

    try {
      const result = await this.supportService.rechargeBalance(
        data.driverUserId,
        Number(data.amount),
        data.note || '',
        employerUserId,
      );

      // Confirm recharge to the employer + send system message in chat
      client.emit('support:recharge_done', {
        success: true,
        amount: data.amount,
        newBalance: result.newBalance,
        conversationId: result.conversationId,
        systemMessage: result.message,
      });

      // Also push the system message to the employer's chat view
      client.emit('support:message', result.message);
    } catch (e: any) {
      console.error('Recharge error:', e);
      client.emit('support:recharge_done', {
        success: false,
        error: e.message || 'فشل عملية الشحن',
      });
    }
  }
}
