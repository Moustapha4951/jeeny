import { Controller, Get, Post, Put, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  // Public endpoint for testing
  @Get('dashboard')
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  // Public endpoint for testing
  @Get('drivers')
  async getAllDrivers() {
    return this.adminService.getAllDrivers();
  }

  // Public endpoint for testing
  @Get('rides')
  async getAllRides() {
    return this.adminService.getAllRides();
  }

  // Public endpoint for testing
  @Get('drivers/:id')
  async getDriverById(@Param('id') id: string) {
    return this.adminService.getDriverById(id);
  }

  // Public endpoint for testing
  @Post('drivers/:id/approve')
  async approveDriver(@Param('id') id: string) {
    return this.adminService.approveDriver(id);
  }

  // Public endpoint for testing
  @Post('drivers/:id/reject')
  async rejectDriver(@Param('id') id: string, @Body('reason') reason: string) {
    return this.adminService.rejectDriver(id, reason);
  }

  // Public endpoint for testing
  @Post('drivers/:id/suspend')
  async suspendDriver(@Param('id') id: string, @Body('reason') reason: string) {
    return this.adminService.suspendDriver(id, reason);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('rides/:id')
  async getRideById(@Param('id') id: string) {
    return this.adminService.getRideById(id);
  }

  // Call center booking endpoint (public for testing)
  @Post('callcenter/book')
  async bookRideForCustomer(@Body() bookingData: any) {
    return this.adminService.bookRideForCustomer(bookingData);
  }

  // Fare estimation endpoint (public for testing)
  @Post('callcenter/estimate')
  async estimateFare(@Body() estimateData: any) {
    return this.adminService.estimateFare(estimateData);
  }
}
