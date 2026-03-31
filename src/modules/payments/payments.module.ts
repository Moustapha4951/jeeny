import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentGatewayService } from './gateway.service';
import { PayoutsService } from './payouts.service';
import { PaymentsController } from './payments.controller';
import { WebhooksController } from './webhooks.controller';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  controllers: [PaymentsController, WebhooksController],
  providers: [PaymentsService, PaymentGatewayService, PayoutsService],
  exports: [PaymentsService, PaymentGatewayService, PayoutsService],
})
export class PaymentsModule {}
