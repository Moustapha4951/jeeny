import { Module } from '@nestjs/common';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { FareService } from './fare.service';
import { MatchingService } from './matching.service';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';
import { DriverModule } from '../driver/driver.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [DriverModule, PrismaModule],
  controllers: [RidesController, RatingsController],
  providers: [RidesService, FareService, MatchingService, RatingsService],
  exports: [RidesService, FareService, MatchingService, RatingsService],
})
export class RidesModule {}
