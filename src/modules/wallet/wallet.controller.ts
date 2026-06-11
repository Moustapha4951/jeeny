import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get('balance')
  async getBalance(@CurrentUser('id') userId: string) {
    return this.walletService.getBalance(userId);
  }

  @Get('transactions')
  async getTransactions(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
  ) {
    return this.walletService.getTransactionHistory(
      userId,
      limit ? parseInt(limit) : 50,
    );
  }

  @Post('topup')
  async topup(
    @CurrentUser('id') userId: string,
    @Body('amount') amount: number,
    @Body('gateway') gateway: 'BANKILY' | 'SEDAD' | 'MASRVI',
  ) {
    return { message: 'Top-up initiated', amount, gateway };
  }

  // ─── Recharge Requests ───────────────────────────────────────────────────

  @Post('recharge-request')
  async createRechargeRequest(
    @CurrentUser('id') userId: string,
    @Body() body: { amount: number; screenshotUrl?: string },
  ) {
    return this.walletService.createRechargeRequest(
      userId,
      body.amount,
      body.screenshotUrl,
    );
  }

  @Get('recharge-requests')
  async getRechargeRequests(@Query('status') status?: string) {
    return this.walletService.getRechargeRequests(status);
  }

  @Get('my-recharge-requests')
  async getMyRechargeRequests(@CurrentUser('id') userId: string) {
    return this.walletService.getMyRechargeRequests(userId);
  }

  @Post('recharge-request/:id/approve')
  async approveRechargeRequest(
    @Param('id') id: string,
    @CurrentUser('id') reviewerId: string,
  ) {
    return this.walletService.approveRechargeRequest(id, reviewerId);
  }

  @Post('recharge-request/:id/deny')
  async denyRechargeRequest(
    @Param('id') id: string,
    @CurrentUser('id') reviewerId: string,
    @Body('note') note?: string,
  ) {
    return this.walletService.denyRechargeRequest(id, reviewerId, note);
  }
}
