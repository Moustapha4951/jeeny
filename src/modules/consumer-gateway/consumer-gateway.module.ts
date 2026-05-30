import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConsumerGateway } from './consumer.gateway';
import { PrismaModule } from '../../prisma/prisma.module';

/**
 * Stand-alone module so any other module (rides, drivers) can import
 * the ConsumerGateway without dragging in the rest of the rides module.
 */
@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: process.env.JWT_EXPIRY || '30d' },
    }),
  ],
  providers: [ConsumerGateway],
  exports: [ConsumerGateway],
})
export class ConsumerGatewayModule {}
