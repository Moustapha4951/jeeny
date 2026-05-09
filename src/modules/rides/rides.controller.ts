import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { RidesService } from './rides.service';
import { FareService } from './fare.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateRideDto } from './dto/create-ride.dto';

@Controller('rides')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RidesController {
  constructor(
    private ridesService: RidesService,
    private fareService: FareService,
  ) {}

  @Post('estimate')
  @Roles('CONSUMER', 'ADMIN')
  async estimateFare(@Body() body: {
    vehicleTypeId: string;
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    promoCode?: string;
  }) {
    return this.fareService.estimateFare(
      body.vehicleTypeId, body.pickupLat, body.pickupLng,
      body.dropoffLat, body.dropoffLng, body.promoCode,
    );
  }

  @Post()
  @Roles('CONSUMER')
  async createRide(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateRideDto,
  ) {
    return this.ridesService.createRideFromConsumer(userId, dto);
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

  @Post(':id/cancel')
  async cancelRide(
    @Param('id') rideId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { reason: string },
  ) {
    return this.ridesService.cancelRide(rideId, userId, body.reason || 'User cancelled');
  }
}
