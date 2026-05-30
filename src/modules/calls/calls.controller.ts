import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CallsService } from './calls.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private callsService: CallsService) {}

  /// Initiate a voice/video call to the counterparty of this ride.
  /// Returns the Agora `appId`, a per-user `token`, the `channelName`
  /// and the numeric `uid` the caller should use when joining.
  @Post('rides/:rideId/call')
  async initiateRideCall(
    @Param('rideId') rideId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { type?: 'VOICE' | 'VIDEO' },
  ) {
    return this.callsService.initiateRideCall(
      rideId,
      userId,
      body?.type ?? 'VOICE',
    );
  }

  @Post('calls/:id/accept')
  async accept(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.callsService.acceptCall(id, userId);
  }

  @Post('calls/:id/reject')
  async reject(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() body: { reason?: string },
  ) {
    return this.callsService.rejectCall(id, userId, body?.reason);
  }

  @Post('calls/:id/end')
  async end(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.callsService.endCall(id, userId);
  }

  @Get('calls')
  async myCalls(@CurrentUser('id') userId: string) {
    return this.callsService.getMyCalls(userId);
  }
}
