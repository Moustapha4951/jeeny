import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtAuthService } from './jwt.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RechargeService } from '../driver/recharge.service';
import { AdminService } from '../admin/admin.service';
import { RechargeRequestStatus } from '@prisma/client';

/**
 * Employee-facing endpoints for the masar_employer_app. Two responsibilities:
 *
 *   1. Email + password login (passwordHash stored on User.fcmToken for v1)
 *   2. Driver wallet recharge approval queue + chat
 *
 * Each endpoint that requires auth verifies the caller is a registered
 * Employee (not just any User) before letting them through.
 */
@Controller('auth/employee')
export class EmployeeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtAuthService: JwtAuthService,
    private readonly rechargeService: RechargeService,
    private readonly adminBookingService: AdminService,
  ) {}

  // ─── Login ──────────────────────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: { email: string; password: string }) {
    const { email, password } = body;
    if (!email || !password) {
      return {
        success: false,
        message: 'البريد الإلكتروني وكلمة المرور مطلوبان',
      };
    }
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { employee: true },
    });
    if (!user || !user.employee) {
      return {
        success: false,
        message: 'الحساب غير مسجل كموظف',
      };
    }
    // v1 stores plain-text password in `passwordHash` (no hashing yet).
    // Falls back to the legacy `fcmToken`-as-password convention for any
    // accounts that haven't been migrated yet.
    const stored = user.passwordHash ?? user.fcmToken;
    if (!stored || stored !== password) {
      return {
        success: false,
        message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      };
    }
    const tokens = await this.jwtAuthService.generateTokens(user.id, 'EMPLOYEE');
    return {
      success: true,
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        role: user.employee.role,
        department: user.employee.department,
        employeeId: user.employee.employeeId,
      },
    };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async profile(@Request() req: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      include: { employee: true },
    });
    if (!user || !user.employee) {
      throw new ForbiddenException('Not an employee');
    }
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      role: user.employee.role,
      department: user.employee.department,
      employeeId: user.employee.employeeId,
    };
  }

  @Post('fcm-token')
  @UseGuards(JwtAuthGuard)
  async updateFcmToken(
    @Request() req: any,
    @Body() body: { fcmToken: string },
  ) {
    await this.assertEmployee(req.user.id);
    if (!body.fcmToken) {
      throw new BadRequestException('fcmToken is required');
    }
    await this.prisma.user.update({
      where: { id: req.user.id },
      data: { fcmToken: body.fcmToken },
    });
    return { success: true };
  }

  // ─── Booking (call-center style) ───────────────────────────────────────

  @Post('book-ride')
  @UseGuards(JwtAuthGuard)
  async bookRide(@Request() req: any, @Body() body: any) {
    const employee = await this.assertEmployee(req.user.id);
    const result = await this.adminBookingService.bookRideForCustomer(body);
    // Record this booking against the employee so it appears in their
    // "rides" list later. We don't fail if the row insert fails — the
    // ride itself is already created.
    try {
      const rideId = (result as any)?.ride?.id || (result as any)?.rideId;
      if (rideId && body.vehicleTypeId) {
        await this.prisma.callCenterBooking.create({
          data: {
            rideId,
            employeeId: employee.id,
            customerPhone: body.customerPhone,
            customerName: body.customerName ?? null,
            pickupLat: body.pickupLat,
            pickupLng: body.pickupLng,
            pickupAddress: body.pickupAddress,
            dropoffLat: body.dropoffLat ?? null,
            dropoffLng: body.dropoffLng ?? null,
            dropoffAddress: body.dropoffAddress ?? null,
            vehicleTypeId: body.vehicleTypeId,
            driverNotes: body.driverNotes ?? null,
          },
        });
      }
    } catch (e) {
      // ignore — booking record is best-effort
    }
    return result;
  }

  @Post('estimate-fare')
  @UseGuards(JwtAuthGuard)
  async estimateFare(@Request() req: any, @Body() body: any) {
    await this.assertEmployee(req.user.id);
    return this.adminBookingService.estimateFare(body);
  }

  @Post('drivers/nearby')
  @UseGuards(JwtAuthGuard)
  async nearbyDrivers(@Request() req: any, @Body() body: any) {
    await this.assertEmployee(req.user.id);
    return this.adminBookingService.getNearbyDriversForCustomSelection(body);
  }

  @Get('rides')
  @UseGuards(JwtAuthGuard)
  async myRides(@Request() req: any) {
    const employee = await this.assertEmployee(req.user.id);
    // Pull every CallCenterBooking that this employee created and join the
    // ride alongside so the app can show pickup/dropoff/status nicely.
    const bookings = await this.prisma.callCenterBooking.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        ride: {
          include: {
            driver: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    const rides = bookings
      .filter((b) => b.ride !== null)
      .map((b) => ({
        id: b.ride!.id,
        rideNumber: b.ride!.rideNumber,
        status: b.ride!.status,
        pickupAddress: b.ride!.pickupAddress,
        dropoffAddress: b.ride!.dropoffAddress,
        estimatedFare: b.ride!.estimatedFare,
        finalFare: b.ride!.finalFare,
        createdAt: b.ride!.createdAt,
        completedAt: b.ride!.completedAt,
        customerName: b.customerName,
        customerPhone: b.customerPhone,
        driver: b.ride!.driver
          ? {
              firstName: b.ride!.driver.user.firstName,
              lastName: b.ride!.driver.user.lastName,
              phone: b.ride!.driver.user.phone,
            }
          : null,
      }));
    return { rides };
  }

  // ─── Recharge queue ─────────────────────────────────────────────────────

  @Get('recharge-requests')
  @UseGuards(JwtAuthGuard)
  async listRechargeRequests(
    @Request() req: any,
    @Query('status') status?: RechargeRequestStatus | 'ALL',
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    await this.assertEmployee(req.user.id);
    return this.rechargeService.listForEmployee({
      status,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Get('recharge-requests/:id')
  @UseGuards(JwtAuthGuard)
  async getRechargeRequest(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    await this.assertEmployee(req.user.id);
    return this.rechargeService.findOneForEmployee(id);
  }

  @Post('recharge-requests/:id/messages')
  @UseGuards(JwtAuthGuard)
  async sendRechargeMessage(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { body?: string; imageUrl?: string },
  ) {
    const employee = await this.assertEmployee(req.user.id);
    return this.rechargeService.sendEmployeeMessage(
      employee.id,
      req.user.id,
      id,
      body.body,
      body.imageUrl,
    );
  }

  @Post('recharge-requests/:id/approve')
  @UseGuards(JwtAuthGuard)
  async approveRechargeRequest(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    const employee = await this.assertEmployee(req.user.id);
    return this.rechargeService.approve(employee.id, id);
  }

  @Post('recharge-requests/:id/reject')
  @UseGuards(JwtAuthGuard)
  async rejectRechargeRequest(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    const employee = await this.assertEmployee(req.user.id);
    return this.rechargeService.reject(employee.id, id, body.reason ?? '');
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private async assertEmployee(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
    });
    if (!employee) {
      throw new ForbiddenException('Not an employee');
    }
    return employee;
  }
}
