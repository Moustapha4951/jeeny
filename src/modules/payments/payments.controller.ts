import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentGatewayService } from './gateway.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(
    private paymentsService: PaymentsService,
    private gatewayService: PaymentGatewayService,
  ) {}

  @Get()
  async getPaymentHistory(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentsService.getPaymentHistory(
      userId,
      limit ? parseInt(limit) : 50,
    );
  }

  @Get(':id')
  async getPaymentById(@Param('id') paymentId: string) {
    return this.paymentsService.getPaymentById(paymentId);
  }

  @Post('initiate')
  async initiatePayment(
    @CurrentUser('id') userId: string,
    @Body('amount') amount: number,
    @Body('gateway') gateway: 'BANKILY' | 'SEDAD' | 'MASRVI',
    @Body('referenceId') referenceId: string,
  ) {
    return this.gatewayService.initiatePayment(
      gateway,
      amount,
      userId,
      referenceId,
    );
  }

  @Post(':id/refund')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async refundPayment(
    @Param('id') paymentId: string,
    @Body('reason') reason: string,
  ) {
    return this.paymentsService.processRefund(paymentId, reason);
  }
}
