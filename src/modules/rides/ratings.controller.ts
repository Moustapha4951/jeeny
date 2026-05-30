import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('ratings')
@UseGuards(JwtAuthGuard)
export class RatingsController {
  constructor(private ratingsService: RatingsService) {}

  /// Tags surfaced as chips beneath the star picker. The client passes
  /// `?applies=DRIVER` when a rider rates their driver, or
  /// `?applies=RIDER` when a driver rates their rider.
  @Get('tags')
  async getTags(@Query('applies') applies?: string) {
    const a = applies === 'RIDER' ? 'RIDER' : 'DRIVER';
    return this.ratingsService.getTags(a);
  }
}
