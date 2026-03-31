import { Controller, Get, Param, Query, Post, Body, UseGuards } from '@nestjs/common';
import { IntercityService } from './intercity.service';
import { AuthGuard } from '../auth/auth.guard';
import { CreateIntercityTripDto } from './dto/create-intercity-trip.dto';

@Controller('intercity')
@UseGuards(AuthGuard)
export class IntercityController {
  constructor(private readonly intercityService: IntercityService) {}

  @Get()
  async findAll(@Query() query: any) {
    return this.intercityService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.intercityService.findOne(id);
  }

  @Post()
  async create(@Body() createIntercityTripDto: CreateIntercityTripDto) {
    return this.intercityService.create(createIntercityTripDto);
  }

  @Post(':id/confirm')
  async confirmTrip(@Param('id') id: string) {
    return this.intercityService.confirmTrip(id);
  }

  @Post(':id/cancel')
  async cancelTrip(@Param('id') id: string) {
    return this.intercityService.cancelTrip(id);
  }

  @Get('available')
  async getAvailableTrips(@Query() query: any) {
    return this.intercityService.getAvailableTrips(query);
  }

  @Get('routes')
  async getRoutes(@Query() query: any) {
    return this.intercityService.getRoutes(query);
  }
}
