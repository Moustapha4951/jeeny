import { Module } from '@nestjs/common';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConsumerGatewayModule } from '../consumer-gateway/consumer-gateway.module';

@Module({
  imports: [PrismaModule, ConsumerGatewayModule],
  controllers: [SosController],
  providers: [SosService],
  exports: [SosService],
})
export class SosModule {}
