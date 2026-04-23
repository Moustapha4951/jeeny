import { Module } from '@nestjs/common';
// import { RidesService } from './rides.service';
import { FareService } from './fare.service';
import { MatchingService } from './matching.service';
import { DriverModule } from '../driver/driver.module';
// import { RidesController } from './rides.controller';

@Module({
  imports: [DriverModule],
  controllers: [], // Temporarily disabled: RidesController
  providers: [FareService, MatchingService], // Temporarily removed: RidesService
  exports: [FareService, MatchingService], // Temporarily removed: RidesService
})
export class RidesModule {}
