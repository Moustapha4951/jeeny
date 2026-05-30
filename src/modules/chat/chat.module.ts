import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConsumerGatewayModule } from '../consumer-gateway/consumer-gateway.module';
import { DriverModule } from '../driver/driver.module';

@Module({
  imports: [PrismaModule, ConsumerGatewayModule, DriverModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
