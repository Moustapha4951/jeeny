import { Controller, Get, Param, Query, Post, Body, UseGuards } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { AuthGuard } from '../auth/auth.guard';
import { CreateVehicleDto } from './dto/create-vehicle.dto';

@Controller('vehicles')
@UseGuards(AuthGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  async findAll(@Query() query: any) {
    return this.vehiclesService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.vehiclesService.findOne(id);
  }

  @Post()
  async create(@Body() createVehicleDto: CreateVehicleDto) {
    return this.vehiclesService.create(createVehicleDto);
  }

  @Post(':id/approve')
  async approveVehicle(@Param('id') id: string) {
    return this.vehiclesService.approveVehicle(id);
  }

  @Post(':id/suspend')
  async suspendVehicle(@Param('id') id: string) {
    return this.vehiclesService.suspendVehicle(id);
  }

  @Get('driver/:driverId')
  async getDriverVehicles(@Param('driverId') driverId: string) {
    return this.vehiclesService.getDriverVehicles(driverId);
  }

  @Get('available')
  async getAvailableVehicles(@Query() query: any) {
    return this.vehiclesService.getAvailableVehicles(query);
  }
}
