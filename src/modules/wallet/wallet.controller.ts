import {
  Controller,
  Get,
  Post,
  Body,
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
    // This will be integrated with payment gateway
    return {
      message: 'Top-up initiated',
      amount,
      gateway,
    };
  }
}
