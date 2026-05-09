import { Module } from '@nestjs/common';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { FareService } from './fare.service';
import { MatchingService } from './matching.service';
import { DriverModule } from '../driver/driver.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [DriverModule, PrismaModule],
  controllers: [RidesController],
  providers: [RidesService, FareService, MatchingService],
  exports: [RidesService, FareService, MatchingService],
})
export class RidesModule {}
