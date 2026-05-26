import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { DriverService } from './driver.service';
import { AssignmentsService } from './assignments.service';
import { RechargeService } from './recharge.service';
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
    private readonly assignmentsService: AssignmentsService,
    private readonly rechargeService: RechargeService,
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
  async acceptRide(@Request() req: any, @Param('rideId') rideId: string) {
    return this.driverService.acceptRide(req.user.id, rideId);
  }

  @Post('rides/:rideId/reject')
  async rejectRide(
    @Request() req: any,
    @Param('rideId') rideId: string,
    @Body() body: { reason: string },
  ) {
    return this.driverService.rejectRide(req.user.id, rideId, body.reason);
  }

  @Post('rides/:rideId/arrived')
  async arrivedAtPickup(@Request() req: any, @Param('rideId') rideId: string) {
    return this.driverService.arrivedAtPickup(req.user.id, rideId);
  }

  @Post('rides/:rideId/start')
  async startRide(@Request() req: any, @Param('rideId') rideId: string) {
    return this.driverService.startRide(req.user.id, rideId);
  }

  @Post('rides/:rideId/complete')
  async completeRide(@Request() req: any, @Param('rideId') rideId: string) {
    return this.driverService.completeRide(req.user.id, rideId);
  }

  @Post('rides/:rideId/cancel')
  async cancelRide(
    @Request() req: any,
    @Param('rideId') rideId: string,
    @Body() body: { reason: string },
  ) {
    return this.driverService.cancelRideByDriver(req.user.id, rideId, body.reason || 'تم الإلغاء من قِبل السائق');
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

  @Post('vehicle/register')
  async registerVehicle(
    @Request() req: any,
    @Body() body: {
      brand: string;
      model: string;
      year: number;
      color: string;
      colorAr: string;
      plateNumber: string;
      registrationNumber: string;
      registrationExpiry: string;
    },
  ) {
    return this.driverService.registerVehicle(req.user.id, body);
  }

  @Get('ranking')
  async getRanking(@Request() req: any) {
    const me = await this.prisma.driver.findUnique({
      where: { userId: req.user.id },
      select: {
        id: true,
        totalTrips: true,
        rating: true,
        user: { select: { firstName: true, lastName: true, avatar: true } },
      },
    });
    if (!me) {
      return {
        rank: null,
        totalDrivers: 0,
        myTotalTrips: 0,
        myRating: 0,
        leaderboard: [],
      };
    }

    // Drivers ranked above me (more trips, or same trips + higher rating)
    const ahead = await this.prisma.driver.count({
      where: {
        status: 'APPROVED',
        OR: [
          { totalTrips: { gt: me.totalTrips } },
          {
            AND: [
              { totalTrips: me.totalTrips },
              { rating: { gt: me.rating } },
            ],
          },
        ],
      },
    });

    const totalDrivers = await this.prisma.driver.count({
      where: { status: 'APPROVED' },
    });

    // Top 20 leaderboard entries — names + avatars only, NO phone numbers
    const top = await this.prisma.driver.findMany({
      where: { status: 'APPROVED' },
      orderBy: [
        { totalTrips: 'desc' },
        { rating: 'desc' },
      ],
      take: 20,
      select: {
        id: true,
        totalTrips: true,
        rating: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    });

    const myRank = ahead + 1;

    return {
      rank: myRank,
      totalDrivers,
      myTotalTrips: me.totalTrips,
      myRating: me.rating,
      me: {
        firstName: me.user.firstName,
        lastName: me.user.lastName,
        avatar: me.user.avatar,
        rank: myRank,
        totalTrips: me.totalTrips,
        rating: me.rating,
      },
      leaderboard: top.map((d, i) => ({
        rank: i + 1,
        driverId: d.id,
        firstName: d.user.firstName,
        lastName: d.user.lastName,
        avatar: d.user.avatar,
        totalTrips: d.totalTrips,
        rating: d.rating,
        isMe: d.id === me.id,
      })),
    };
  }

  // ── Assignments / Challenges ────────────────────────────────────────────

  @Get('assignments')
  async listAssignments(@Request() req: any) {
    return this.assignmentsService.listForDriver(req.user.id);
  }

  @Post('assignments/:id/claim')
  async claimAssignment(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    return this.assignmentsService.claimReward(req.user.id, id);
  }

  // ── Wallet recharge requests ───────────────────────────────────────────

  @Get('recharge-requests')
  async listRechargeRequests(@Request() req: any) {
    return this.rechargeService.listForDriver(req.user.id);
  }

  @Post('recharge-requests')
  async createRechargeRequest(
    @Request() req: any,
    @Body() body: { amount: number },
  ) {
    return this.rechargeService.createRequest(req.user.id, body.amount);
  }

  @Get('recharge-requests/:id')
  async getRechargeRequest(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    return this.rechargeService.findOneForDriver(req.user.id, id);
  }

  @Post('recharge-requests/:id/method')
  async setRechargeMethod(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { method: 'BANKILY' | 'SEDAD' | 'MASRVI' },
  ) {
    return this.rechargeService.setMethod(req.user.id, id, body.method);
  }

  @Post('recharge-requests/:id/messages')
  async sendRechargeMessage(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: {
      body?: string;
      imageUrl?: string;
      audioUrl?: string;
      audioDurationMs?: number;
    },
  ) {
    return this.rechargeService.sendDriverMessage(
      req.user.id,
      id,
      body.body,
      body.imageUrl,
      body.audioUrl,
      body.audioDurationMs,
    );
  }

  @Post('recharge-requests/:id/cancel')
  async cancelRechargeRequest(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    return this.rechargeService.cancelByDriver(req.user.id, id);
  }
}
