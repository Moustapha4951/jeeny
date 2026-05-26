import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CallsService } from './calls.service';

/**
 * Voice/video calls between any two Masar users (driver, employee, etc.).
 * Authentication uses the same JWT as the rest of the platform — both
 * caller and receiver must hold a valid token.
 */
@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Post('start')
  async start(
    @Request() req: any,
    @Body() body: { receiverId: string },
  ) {
    return this.calls.start(req.user.id, body.receiverId);
  }

  /// Convenience for the driver: call into the recharge support pool by
  /// request id. The backend resolves the right employee (assigned, or
  /// fans out to any FINANCE / OPERATIONS user with an FCM token).
  @Post('recharge-support')
  async startRechargeSupport(
    @Request() req: any,
    @Body() body: { requestId: string },
  ) {
    return this.calls.startRechargeSupport(req.user.id, body.requestId);
  }

  @Get(':id/token')
  async token(@Request() req: any, @Param('id') id: string) {
    return this.calls.getToken(req.user.id, id);
  }

  @Post(':id/answer')
  async answer(@Request() req: any, @Param('id') id: string) {
    return this.calls.advance(req.user.id, id, 'ANSWERED');
  }

  @Post(':id/reject')
  async reject(@Request() req: any, @Param('id') id: string) {
    return this.calls.advance(req.user.id, id, 'REJECTED');
  }

  @Post(':id/end')
  async end(@Request() req: any, @Param('id') id: string) {
    return this.calls.advance(req.user.id, id, 'ENDED');
  }
}
