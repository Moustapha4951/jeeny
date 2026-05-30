import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { FareService } from './fare.service';
import { MatchingService } from './matching.service';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';
import { ConsumerGatewayModule } from '../consumer-gateway/consumer-gateway.module';
import { DriverModule } from '../driver/driver.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    DriverModule,
    PrismaModule,
    ConsumerGatewayModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: process.env.JWT_EXPIRY || '30d' },
    }),
  ],
  controllers: [RidesController, RatingsController],
  providers: [
    RidesService,
    FareService,
    MatchingService,
    RatingsService,
  ],
  exports: [
    RidesService,
    FareService,
    MatchingService,
    RatingsService,
  ],
})
export class RidesModule {}
