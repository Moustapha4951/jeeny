import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { RidesService } from './rides.service';
import { FareService } from './fare.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateRideDto } from './dto/create-ride.dto';
import { AcceptRideDto, CompleteRideDto, CancelRideDto } from './dto/ride-action.dto';

@Controller('rides')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RidesController {
  constructor(
    private ridesService: RidesService,
    private fareService: FareService,
  ) {}

  @Post('estimate')
  @Roles('CONSUMER')
  async estimateFare(
    @Body()
    body: {
      vehicleTypeId: string;
      pickupLatitude: number;
      pickupLongitude: number;
      dropoffLatitude: number;
      dropoffLongitude: number;
      promoCode?: string;
    },
  ) {
    return this.fareService.estimateFare(
      body.vehicleTypeId,
      body.pickupLatitude,
      body.pickupLongitude,
      body.dropoffLatitude,
      body.dropoffLongitude,
      body.promoCode,
    );
  }

  @Post()
  @Roles('CONSUMER')
  async createRide(
    @CurrentUser('id') userId: string,
    @Body() createRideDto: CreateRideDto,
  ) {
    return this.ridesService.createRide({
      consumerId: userId,
      ...createRideDto,
      scheduledFor: createRideDto.scheduledFor
        ? new Date(createRideDto.scheduledFor)
        : undefined,
    });
  }

  @Get()
  async getUserRides(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.ridesService.getUserRides(userId, role);
  }

  @Get(':id')
  async getRideById(@Param('id') rideId: string) {
    return this.ridesService.getRideById(rideId);
  }

  @Post('accept')
  @Roles('DRIVER')
  async acceptRide(
    @CurrentUser('id') driverId: string,
    @Body() acceptRideDto: AcceptRideDto,
  ) {
    return this.ridesService.acceptRide(acceptRideDto.rideId, driverId);
  }

  @Post(':id/arrive')
  @Roles('DRIVER')
  async arriveAtPickup(
    @Param('id') rideId: string,
    @CurrentUser('id') driverId: string,
  ) {
    return this.ridesService.arriveAtPickup(rideId, driverId);
  }

  @Post(':id/start')
  @Roles('DRIVER')
  async startRide(
    @Param('id') rideId: string,
    @CurrentUser('id') driverId: string,
  ) {
    return this.ridesService.startRide(rideId, driverId);
  }

  @Post(':id/complete')
  @Roles('DRIVER')
  async completeRide(
    @Param('id') rideId: string,
    @CurrentUser('id') driverId: string,
    @Body() completeRideDto: CompleteRideDto,
  ) {
    return this.ridesService.completeRide(
      rideId,
      driverId,
      completeRideDto.actualDistance,
    );
  }

  @Post(':id/cancel')
  async cancelRide(
    @Param('id') rideId: string,
    @CurrentUser('id') userId: string,
    @Body() cancelRideDto: CancelRideDto,
  ) {
    return this.ridesService.cancelRide(rideId, userId, cancelRideDto.reason);
  }
}
