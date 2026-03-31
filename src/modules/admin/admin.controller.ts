import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminsService } from '../users/admins.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApproveDriverDto, RejectDriverDto, SuspendDriverDto } from './dto/driver-approval.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class AdminController {
  constructor(private adminsService: AdminsService) {}

  @Get('drivers/pending')
  async getPendingDrivers() {
    return this.adminsService.getPendingDrivers();
  }

  @Get('drivers')
  async getAllDrivers(@Query('status') status?: string) {
    return this.adminsService.getAllDrivers(status);
  }

  @Post('drivers/approve')
  async approveDriver(
    @Body() approveDriverDto: ApproveDriverDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminsService.approveDriver(
      approveDriverDto.driverId,
      adminId,
    );
  }

  @Post('drivers/reject')
  async rejectDriver(
    @Body() rejectDriverDto: RejectDriverDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminsService.rejectDriver(
      rejectDriverDto.driverId,
      adminId,
      rejectDriverDto.reason,
    );
  }

  @Post('drivers/suspend')
  async suspendDriver(
    @Body() suspendDriverDto: SuspendDriverDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminsService.suspendDriver(
      suspendDriverDto.driverId,
      adminId,
      suspendDriverDto.reason,
    );
  }

  @Get('users')
  async getAllUsers() {
    return this.adminsService.getAllUsers();
  }
}
