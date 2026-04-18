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
import { PrismaService } from '../../prisma/prisma.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

@Controller('driver')
@UseGuards(JwtAuthGuard)
export class DriverController {
  constructor(
    private readonly driverService: DriverService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('profile')
  async getProfile(@Request() req: any) {
    return this.driverService.getProfile(req.user.id);
  }

  @Post('fcm-token')
  async updateFCMToken(@Request() req: any, @Body() body: { fcmToken: string }) {
    await this.prisma.user.update({
      where: { id: req.user.id },
      data: { fcmToken: body.fcmToken },
    });
    return { success: true, message: 'FCM token updated' };
  }

  @Post('profile')
  async updateProfile(
    @Request() req: any,
    @Body() body: { firstName: string; lastName: string },
  ) {
    try {
      // Update user name
      await this.prisma.user.update({
        where: { id: req.user.id },
        data: {
          firstName: body.firstName,
          lastName: body.lastName,
        },
      });

      // Check if driver profile exists, if not create one
      let driver = await this.prisma.driver.findUnique({
        where: { userId: req.user.id },
      });

      if (!driver) {
        console.log('Creating driver profile for user:', req.user.id);
        
        // Create driver profile with minimal required fields
        driver = await this.prisma.driver.create({
          data: {
            userId: req.user.id,
            licenseNumber: `TEMP-${req.user.id.substring(0, 8)}`, // Temporary
            licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
            nationalId: `TEMP-${req.user.id.substring(0, 8)}`, // Temporary
            dateOfBirth: new Date('1990-01-01'), // Default
            gender: 'MALE', // Default
            address: 'Nouakchott', // Default
            city: 'Nouakchott',
            state: 'Nouakchott',
            status: 'PENDING',
          },
        });
        
        console.log('Driver profile created:', driver.id);

        // Create default Economy vehicle for the driver
        const economyVehicleType = await this.prisma.vehicleType.findFirst({
          where: { name: 'Economy' },
        });

        if (economyVehicleType) {
          await this.prisma.vehicle.create({
            data: {
              driverId: driver.id,
              typeId: economyVehicleType.id,
              brand: 'Toyota',
              model: 'Corolla',
              year: 2020,
              color: 'White',
              colorAr: 'أبيض',
              plateNumber: `TEMP-${driver.id.substring(0, 8)}`,
              registrationNumber: `REG-${driver.id.substring(0, 8)}`,
              registrationExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
              status: 'APPROVED', // Auto-approve for testing
              isActive: true,
            },
          });
          console.log('✅ Created default Economy vehicle for driver');
        }

        // Check if any wallet exists for this user
        const existingWallet = await this.prisma.wallet.findFirst({
          where: {
            userId: req.user.id,
          },
        });

        // If wallet exists but is CONSUMER type, update it to DRIVER
        if (existingWallet && existingWallet.type === 'CONSUMER') {
          await this.prisma.wallet.update({
            where: { id: existingWallet.id },
            data: { type: 'DRIVER' },
          });
          console.log('Updated wallet type to DRIVER');
        } else if (!existingWallet) {
          // Create new wallet if none exists
          await this.prisma.wallet.create({
            data: {
              userId: req.user.id,
              type: 'DRIVER',
              balance: 0,
              currency: 'MRU',
            },
          });
          console.log('Created new DRIVER wallet');
        }
      } else {
        console.log('Driver profile already exists:', driver.id);
      }

      return { success: true, driver };
    } catch (error) {
      console.error('Error in updateProfile:', error);
      throw error;
    }
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

  @Post('documents/upload')
  async uploadDocument(
    @Request() req: any,
    @Body() uploadDocumentDto: UploadDocumentDto,
  ) {
    return this.driverService.uploadDocument(req.user.id, uploadDocumentDto);
  }

  @Get('documents')
  async getDocuments(@Request() req: any) {
    return this.driverService.getDocuments(req.user.id);
  }
}
