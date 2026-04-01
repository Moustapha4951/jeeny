import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Query } from '@nestjs/common';
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

  // Check if customer exists by phone
  @Get('customer/check')
  async checkCustomer(@Query('phone') phone: string) {
    return this.adminService.checkCustomerByPhone(phone);
  }

  // Get all vehicle types
  @Get('vehicle-types')
  async getVehicleTypes() {
    return this.adminService.getVehicleTypes();
  }

  // Public endpoint for testing
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

  // Cancel ride endpoint (public for testing)
  @Post('rides/:id/cancel')
  async cancelRide(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.adminService.cancelRide(id, body.reason);
  }

  // Create vehicle type endpoint (public for testing)
  @Post('vehicle-types')
  async createVehicleType(@Body() data: any) {
    return this.adminService.createVehicleType(data);
  }

  // Update vehicle type endpoint (public for testing)
  @Put('vehicle-types/:id')
  async updateVehicleType(@Param('id') id: string, @Body() data: any) {
    return this.adminService.updateVehicleType(id, data);
  }

  // Get system settings endpoint (public for testing)
  @Get('settings')
  async getSystemSettings() {
    return this.adminService.getSystemSettings();
  }

  // Update system setting endpoint (public for testing)
  @Put('settings/:key')
  async updateSystemSetting(@Param('key') key: string, @Body() data: any) {
    return this.adminService.updateSystemSetting(key, data);
  }

  // ===== Zones Management =====
  @Get('zones')
  async getZones() {
    return this.adminService.getZones();
  }

  @Get('zones/:id')
  async getZone(@Param('id') id: string) {
    return this.adminService.getZone(id);
  }

  @Post('zones')
  async createZone(@Body() data: any) {
    return this.adminService.createZone(data);
  }

  @Put('zones/:id')
  async updateZone(@Param('id') id: string, @Body() data: any) {
    return this.adminService.updateZone(id, data);
  }

  @Delete('zones/:id')
  async deleteZone(@Param('id') id: string) {
    return this.adminService.deleteZone(id);
  }

  @Put('zones/:id/toggle')
  async toggleZone(@Param('id') id: string) {
    return this.adminService.toggleZone(id);
  }
}
