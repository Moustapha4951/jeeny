import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DriverController } from './driver.controller';
import { DriverService } from './driver.service';
import { DriverGateway } from './driver.gateway';
import { LocationService } from './location.service';
import { AssignmentsService } from './assignments.service';
import { ConsumerGatewayModule } from '../consumer-gateway/consumer-gateway.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    ConsumerGatewayModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: process.env.JWT_EXPIRY || '30d' },
    }),
  ],
  controllers: [DriverController],
  providers: [DriverService, DriverGateway, LocationService, AssignmentsService],
  exports: [DriverService, DriverGateway, LocationService, AssignmentsService],
})
export class DriverModule {}
