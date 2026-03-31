import { Module } from '@nestjs/common';
import { RidesService } from './rides.service';
import { FareService } from './fare.service';
import { MatchingService } from './matching.service';
import { RidesController } from './rides.controller';

@Module({
  controllers: [RidesController],
  providers: [RidesService, FareService, MatchingService],
  exports: [RidesService, FareService, MatchingService],
})
export class RidesModule {}
