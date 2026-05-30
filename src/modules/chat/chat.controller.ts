import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  /// Fetch (or create) the conversation for this ride and the last 50
  /// messages. Marks anything the caller hasn't seen as DELIVERED.
  @Get('rides/:rideId/chat')
  async getRideChat(
    @Param('rideId') rideId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatService.getRideChat(rideId, userId);
  }

  /// Send a chat message. `messageType` defaults to TEXT; `LOCATION`
  /// passes a `{ lat, lng }` object in `location`.
  @Post('rides/:rideId/chat/message')
  async sendMessage(
    @Param('rideId') rideId: string,
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      content?: string;
      messageType?: 'TEXT' | 'LOCATION';
      location?: any;
    },
  ) {
    return this.chatService.sendMessage(rideId, userId, body);
  }

  /// Bulk-mark received messages as READ.
  @Post('rides/:rideId/chat/read')
  async markRead(
    @Param('rideId') rideId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatService.markRead(rideId, userId);
  }

  /// Unread count for a given ride (used to badge the chat icon).
  @Get('rides/:rideId/chat/unread')
  async getUnread(
    @Param('rideId') rideId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatService.getUnreadCount(rideId, userId);
  }

  /// Quick-reply chips. `?audience=RIDER` (default) or `DRIVER`.
  @Get('chat/quick-replies')
  async getQuickReplies(@Query('audience') audience?: string) {
    const a = audience === 'DRIVER' ? 'DRIVER' : 'RIDER';
    return this.chatService.getQuickReplies(a);
  }
}
