import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateSavedPlaceDto, UpdateSavedPlaceDto } from './dto/saved-place.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('profile')
  async getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.findById(userId);
  }

  @Put('profile')
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, updateProfileDto);
  }

  @Get('saved-places')
  async getSavedPlaces(@CurrentUser('id') userId: string) {
    return this.usersService.getSavedPlaces(userId);
  }

  @Post('saved-places')
  async addSavedPlace(
    @CurrentUser('id') userId: string,
    @Body() createSavedPlaceDto: CreateSavedPlaceDto,
  ) {
    return this.usersService.addSavedPlace(userId, createSavedPlaceDto);
  }

  @Put('saved-places/:id')
  async updateSavedPlace(
    @Param('id') placeId: string,
    @CurrentUser('id') userId: string,
    @Body() updateSavedPlaceDto: UpdateSavedPlaceDto,
  ) {
    return this.usersService.updateSavedPlace(placeId, userId, updateSavedPlaceDto);
  }

  @Delete('saved-places/:id')
  async deleteSavedPlace(
    @Param('id') placeId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.usersService.deleteSavedPlace(placeId, userId);
  }
}
