import { Controller, Post, Body, Headers, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { PaymentGatewayService } from './gateway.service';
import { Public } from '../auth/decorators/public.decorator';
import * as crypto from 'crypto';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly processedWebhooks = new Set<string>();

  constructor(
    private prisma: PrismaService,
    private walletService: WalletService,
    private gatewayService: PaymentGatewayService,
  ) {}

  @Post('bankily')
  @Public()
  async handleBankilyWebhook(
    @Body() payload: any,
    @Headers('x-bankily-signature') signature: string,
  ) {
    this.logger.log('Received Bankily webhook');

    // Verify webhook signature
    if (!this.verifyBankilySignature(payload, signature)) {
      throw new BadRequestException('Invalid signature');
    }

    // Check idempotency
    const webhookId = payload.transactionId;
    if (this.processedWebhooks.has(webhookId)) {
      this.logger.log(`Webhook ${webhookId} already processed`);
      return { status: 'already_processed' };
    }

    try {
      await this.processPaymentWebhook(
        'BANKILY',
        payload.transactionId,
        payload.reference,
        payload.amount,
        payload.status === 'SUCCESS',
      );

      this.processedWebhooks.add(webhookId);
      return { status: 'success' };
    } catch (error) {
      this.logger.error('Bankily webhook processing failed:', error);
      throw error;
    }
  }

  @Post('sedad')
  @Public()
  async handleSedadWebhook(
    @Body() payload: any,
    @Headers('x-sedad-signature') signature: string,
  ) {
    this.logger.log('Received Sedad webhook');

    // Verify webhook signature
    if (!this.verifySedadSignature(payload, signature)) {
      throw new BadRequestException('Invalid signature');
    }

    // Check idempotency
    const webhookId = payload.transactionId;
    if (this.processedWebhooks.has(webhookId)) {
      this.logger.log(`Webhook ${webhookId} already processed`);
      return { status: 'already_processed' };
    }

    try {
      await this.processPaymentWebhook(
        'SEDAD',
        payload.transactionId,
        payload.merchantReference,
        payload.amount,
        payload.status === 'COMPLETED',
      );

      this.processedWebhooks.add(webhookId);
      return { status: 'success' };
    } catch (error) {
      this.logger.error('Sedad webhook processing failed:', error);
      throw error;
    }
  }

  @Post('masrvi')
  @Public()
  async handleMasrviWebhook(
    @Body() payload: any,
    @Headers('x-masrvi-signature') signature: string,
  ) {
    this.logger.log('Received Masrvi webhook');

    // Verify webhook signature
    if (!this.verifyMasrviSignature(payload, signature)) {
      throw new BadRequestException('Invalid signature');
    }

    // Check idempotency
    const webhookId = payload.paymentId;
    if (this.processedWebhooks.has(webhookId)) {
      this.logger.log(`Webhook ${webhookId} already processed`);
      return { status: 'already_processed' };
    }

    try {
      await this.processPaymentWebhook(
        'MASRVI',
        payload.paymentId,
        payload.orderId,
        payload.amount / 100, // Convert from cents
        payload.status === 'PAID',
      );

      this.processedWebhooks.add(webhookId);
      return { status: 'success' };
    } catch (error) {
      this.logger.error('Masrvi webhook processing failed:', error);
      throw error;
    }
  }

  private async processPaymentWebhook(
    gateway: string,
    transactionId: string,
    referenceId: string,
    amount: number,
    success: boolean,
  ) {
    // Find the payment record
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          { id: referenceId },
          { rideId: referenceId },
        ],
        status: 'PENDING',
      },
      include: {
        ride: true,
      },
    });

    if (!payment) {
      this.logger.warn(`Payment not found for reference ${referenceId}`);
      return;
    }

    if (success) {
      // Update payment status
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'COMPLETED',
          gatewayTransactionId: transactionId,
          gateway,
        },
      });

      // Credit driver wallet if ride payment
      if (payment.ride?.driverId && payment.ride?.driverEarnings) {
        await this.walletService.creditBalance(
          payment.ride.driverId,
          payment.ride.driverEarnings,
          `Earnings from ride ${payment.rideId}`,
          payment.id,
        );
      }

      this.logger.log(`Payment ${payment.id} completed via ${gateway}`);
    } else {
      // Update payment status to failed
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          gatewayTransactionId: transactionId,
          gateway,
          failureReason: 'Payment failed at gateway',
        },
      });

      this.logger.log(`Payment ${payment.id} failed via ${gateway}`);
    }
  }

  private verifyBankilySignature(payload: any, signature: string): boolean {
    // Implement Bankily signature verification
    // This is a placeholder - actual implementation depends on Bankily's signature algorithm
    return true;
  }

  private verifySedadSignature(payload: any, signature: string): boolean {
    // Implement Sedad signature verification
    // This is a placeholder - actual implementation depends on Sedad's signature algorithm
    return true;
  }

  private verifyMasrviSignature(payload: any, signature: string): boolean {
    // Implement Masrvi signature verification
    // This is a placeholder - actual implementation depends on Masrvi's signature algorithm
    return true;
  }
}
