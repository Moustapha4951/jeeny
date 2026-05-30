import { Module } from '@nestjs/common';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConsumerGatewayModule } from '../consumer-gateway/consumer-gateway.module';
import { DriverModule } from '../driver/driver.module';

@Module({
  imports: [PrismaModule, ConsumerGatewayModule, DriverModule],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
