import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { RidesService } from './rides.service';
import { FareService } from './fare.service';
import { RatingsService } from './ratings.service';
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
    private ratingsService: RatingsService,
  ) {}

  @Post('estimate')
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

  @Post('nearby-drivers')
  async getNearbyDrivers(@Body() body: {
    pickupLat: number;
    pickupLng: number;
    vehicleTypeId?: string;
  }) {
    return this.ridesService.getNearbyDrivers(
      body.pickupLat,
      body.pickupLng,
      body.vehicleTypeId,
    );
  }

  @Post()
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

  @Get(':id/ratings/mine')
  async getMyRideRating(
    @Param('id') rideId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.ratingsService.getMyRating(rideId, userId);
  }

  @Post(':id/ratings')
  async rateRide(
    @Param('id') rideId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Body() body: { score: number; comment?: string; tags?: string[] },
  ) {
    const fromRole: 'CONSUMER' | 'DRIVER' = role === 'DRIVER' ? 'DRIVER' : 'CONSUMER';
    return this.ratingsService.rateRide(rideId, userId, fromRole, body);
  }
}
