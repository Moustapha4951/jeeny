import { Controller, Post, Body, Headers, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly processedWebhooks = new Set<string>();

  constructor(
    private prisma: PrismaService,
    private walletService: WalletService,
  ) {}

  @Post('bankily')
  @Public()
  async handleBankilyWebhook(
    @Body() payload: any,
    @Headers('x-bankily-signature') signature: string,
  ) {
    this.logger.log('Received Bankily webhook');

    // Verify webhook signature
    if (!this.verifyBankilySignature(payload)) {
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
    if (!this.verifySedadSignature(payload)) {
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
    if (!this.verifyMasrviSignature(payload)) {
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
    success: boolean,
  ) {
    // Find the transaction record
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        OR: [
          { id: referenceId },
          { rideId: referenceId },
        ],
        status: 'PENDING',
      },
      include: {
        rides: true,
      },
    });

    if (!transaction) {
      this.logger.warn(`Transaction not found for reference ${referenceId}`);
      return;
    }

    if (success) {
      // Update transaction status
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'COMPLETED',
          paymentGateway: gateway,
          processedAt: new Date(),
        },
      });

      // Credit driver wallet if ride payment
      const ride = transaction.rides[0];
      if (ride?.driverId) {
        const finalFare = Number(ride.finalFare || 0);
        const platformCommission = finalFare * 0.15;
        const driverEarnings = finalFare - platformCommission;
        
        await this.walletService.creditBalance(
          ride.driverId,
          driverEarnings,
          `Earnings from ride ${transaction.rideId}`,
          transaction.id,
        );
      }

      this.logger.log(`Transaction ${transaction.id} completed via ${gateway}`);
    } else {
      // Update transaction status to failed
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'FAILED',
          paymentGateway: gateway,
          description: 'Payment failed at gateway',
        },
      });

      this.logger.log(`Transaction ${transaction.id} failed via ${gateway}`);
    }
  }

  private verifyBankilySignature(payload: any): boolean {
    // Implement Bankily signature verification
    // This is a placeholder - actual implementation depends on Bankily's signature algorithm
    return true;
  }

  private verifySedadSignature(payload: any): boolean {
    // Implement Sedad signature verification
    // This is a placeholder - actual implementation depends on Sedad's signature algorithm
    return true;
  }

  private verifyMasrviSignature(payload: any): boolean {
    // Implement Masrvi signature verification
    // This is a placeholder - actual implementation depends on Masrvi's signature algorithm
    return true;
  }
}
