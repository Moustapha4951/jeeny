import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { DriversService } from './drivers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdateLocationDto } from './dto/update-location.dto';

@Controller('drivers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DriversController {
  constructor(private driversService: DriversService) {}

  @Get('profile')
  @Roles('DRIVER')
  async getProfile(@CurrentUser('id') userId: string) {
    return this.driversService.findById(userId);
  }

  @Put('online-status')
  @Roles('DRIVER')
  async updateOnlineStatus(
    @CurrentUser('id') userId: string,
    @Body('isOnline') isOnline: boolean,
  ) {
    return this.driversService.updateOnlineStatus(userId, isOnline);
  }

  @Post('location')
  @Roles('DRIVER')
  async updateLocation(
    @CurrentUser('id') userId: string,
    @Body() updateLocationDto: UpdateLocationDto,
  ) {
    return this.driversService.updateLocation(
      userId,
      updateLocationDto.latitude,
      updateLocationDto.longitude,
    );
  }

  @Get('nearby')
  async getNearbyDrivers(
    @Query('latitude') latitude: string,
    @Query('longitude') longitude: string,
    @Query('radius') radius?: string,
  ) {
    return this.driversService.getNearbyDrivers(
      parseFloat(latitude),
      parseFloat(longitude),
      radius ? parseFloat(radius) : 5,
    );
  }

  @Get('stats')
  @Roles('DRIVER')
  async getStats(@CurrentUser('id') userId: string) {
    return this.driversService.getDriverStats(userId);
  }
}
