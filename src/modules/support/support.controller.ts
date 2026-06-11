import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private prisma: PrismaService) {}

  /**
   * Driver submits a support ticket (category + description).
   * Stores in the DB and returns success.
   * No real-time chat — employer reviews tickets separately.
   */
  @Post('ticket')
  async createTicket(
    @CurrentUser('id') userId: string,
    @Body() body: { category: string; description: string },
  ) {
    // Persist as a simple ChatMessage in a SUPPORT conversation
    const conv = await this.prisma.conversation.findFirst({
      where: { type: 'SUPPORT' as any, participant1Id: userId },
    });

    const conversation = conv
      ? conv
      : await this.prisma.conversation.create({
          data: {
            type: 'SUPPORT' as any,
            participant1Id: userId,
            isActive: true,
          },
        });

    const label = body.category
      ? `[${body.category.toUpperCase()}] `
      : '';

    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: userId,
        senderType: 'DRIVER' as any,
        messageType: 'TEXT',
        content: `${label}${body.description}`,
        status: 'SENT',
      },
    });

    return { success: true, message: 'تم إرسال طلبك بنجاح' };
  }
}
