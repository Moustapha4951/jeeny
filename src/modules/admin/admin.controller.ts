import { Controller, Get, Post, Put, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('dashboard')
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('drivers')
  async getAllDrivers() {
    return this.adminService.getAllDrivers();
  }

  @Get('drivers/:id')
  async getDriverById(@Param('id') id: string) {
    return this.adminService.getDriverById(id);
  }

  @Post('drivers/:id/approve')
  async approveDriver(@Param('id') id: string) {
    return this.adminService.approveDriver(id);
  }

  @Post('drivers/:id/reject')
  async rejectDriver(@Param('id') id: string, @Body('reason') reason: string) {
    return this.adminService.rejectDriver(id, reason);
  }

  @Post('drivers/:id/suspend')
  async suspendDriver(@Param('id') id: string, @Body('reason') reason: string) {
    return this.adminService.suspendDriver(id, reason);
  }

  @Get('rides')
  async getAllRides() {
    return this.adminService.getAllRides();
  }

  @Get('rides/:id')
  async getRideById(@Param('id') id: string) {
    return this.adminService.getRideById(id);
  }
}
