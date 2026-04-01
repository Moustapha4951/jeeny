import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { DriverService } from './driver.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('driver')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DRIVER')
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @Get('profile')
  async getProfile(@Request() req: any) {
    return this.driverService.getProfile(req.user.id);
  }

  @Post('location')
  async updateLocation(
    @Request() req: any,
    @Body() body: { latitude: number; longitude: number },
  ) {
    return this.driverService.updateLocation(
      req.user.id,
      body.latitude,
      body.longitude,
    );
  }

  @Post('availability')
  async toggleAvailability(
    @Request() req: any,
    @Body() body: { isOnline: boolean },
  ) {
    return this.driverService.toggleAvailability(req.user.id, body.isOnline);
  }

  @Get('rides/active')
  async getActiveRides(@Request() req: any) {
    return this.driverService.getActiveRides(req.user.id);
  }

  @Get('rides/history')
  async getRideHistory(
    @Request() req: any,
    @Body() query: { page?: number; limit?: number },
  ) {
    return this.driverService.getRideHistory(
      req.user.id,
      query.page || 1,
      query.limit || 20,
    );
  }

  @Post('rides/:rideId/accept')
  async acceptRide(@Request() req: any, @Body() body: { rideId: string }) {
    return this.driverService.acceptRide(req.user.id, body.rideId);
  }

  @Post('rides/:rideId/reject')
  async rejectRide(
    @Request() req: any,
    @Body() body: { rideId: string; reason: string },
  ) {
    return this.driverService.rejectRide(req.user.id, body.rideId, body.reason);
  }

  @Get('earnings')
  async getEarnings(
    @Request() req: any,
    @Body() query: { period?: string },
  ) {
    return this.driverService.getEarnings(req.user.id, query.period);
  }

  @Get('wallet')
  async getWallet(@Request() req: any) {
    return this.driverService.getWallet(req.user.id);
  }
}
