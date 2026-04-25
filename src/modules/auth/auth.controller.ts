import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { OtpService } from './otp.service';
import { JwtAuthService } from './jwt.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private otpService: OtpService,
    private jwtAuthService: JwtAuthService,
    private prisma: PrismaService,
  ) {}

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    await this.otpService.sendOTP(sendOtpDto.phoneNumber);
    
    // DEV MODE: Return OTP in response for testing
    const otp = await this.otpService.getOTPForDev(sendOtpDto.phoneNumber);
    
    return {
      message: 'OTP sent successfully',
      expiresIn: 300, // 5 minutes
      otp: otp, // DEV ONLY - Remove in production!
    };
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto): Promise<AuthResponseDto> {
    // Verify OTP
    await this.otpService.verifyOTP(verifyOtpDto.phoneNumber, verifyOtpDto.otp);

    // Find or create user with relations
    let user = await this.prisma.user.findUnique({
      where: { phone: verifyOtpDto.phoneNumber },
      include: {
        admin: true,
        driver: true,
        employee: true,
        consumer: true,
      },
    });

    if (!user) {
      // Create new user
      user = await this.prisma.user.create({
        data: {
          phone: verifyOtpDto.phoneNumber,
          phoneVerified: true,
          firstName: '',
          lastName: '',
        },
        include: {
          admin: true,
          driver: true,
          employee: true,
          consumer: true,
        },
      });

      // Create consumer profile
      await this.prisma.consumer.create({
        data: {
          userId: user.id,
        },
      });

      // Create wallet for new user
      await this.prisma.wallet.create({
        data: {
          userId: user.id,
          type: 'CONSUMER',
          balance: 0,
          currency: 'MRU',
        },
      });
    } else {
      // Update phone verification status
      if (!user.phoneVerified) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { phoneVerified: true },
          include: {
            admin: true,
            driver: true,
            employee: true,
            consumer: true,
          },
        });
      }
    }

    // Update FCM token if provided
    if (verifyOtpDto.fcmToken) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { fcmToken: verifyOtpDto.fcmToken },
      });
    }

    // Determine user role based on relations
    let role = 'CONSUMER';
    if (user.admin) role = 'ADMIN';
    else if (user.driver) role = 'DRIVER';
    else if (user.employee) role = 'EMPLOYEE';

    // Generate JWT tokens
    const tokens = await this.jwtAuthService.generateTokens(
      user.id,
      role,
      verifyOtpDto.deviceInfo,
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        phoneNumber: user.phone,
        role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    const tokens = await this.jwtAuthService.refreshTokens(
      refreshTokenDto.refreshToken,
    );
    return tokens;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req: any) {
    await this.jwtAuthService.logout(req.user.sessionId);
    return { message: 'Logged out successfully' };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(@Request() req: any) {
    await this.jwtAuthService.logoutAllSessions(req.user.id);
    return { message: 'Logged out from all devices successfully' };
  }

  // ── Employer (Company) Login ──────────────────────────────────────────────────
  // Login via email + password (passwordHash stored on User record)
  @Post('employer/login')
  @HttpCode(HttpStatus.OK)
  async employerLogin(@Body() body: { email: string; password: string; fcmToken?: string }) {
    const { email, password, fcmToken } = body;

    if (!email || !password) {
      return { success: false, message: 'البريد الإلكتروني وكلمة المرور مطلوبان' };
    }

    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        consumer: { include: { company: true } },
        admin: true,
        driver: true,
        employee: true,
      },
    });

    if (!user) {
      return { success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' };
    }

    // Check password — for employer accounts (v1), password is stored in fcmToken field
    // (employer users don't receive push notifications so this field is repurposed)
    const storedPassword = user.fcmToken;
    if (!storedPassword || storedPassword !== password) {
      return { success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' };
    }

    // Must be a consumer with a company
    if (!user.consumer || !user.consumer.companyId) {
      return { success: false, message: 'هذا الحساب غير مرتبط بشركة' };
    }

    // Note: fcmToken is repurposed as password storage for employer users in v1
    // Do NOT update fcmToken here as it would overwrite the stored password

    // Generate tokens
    const tokens = await this.jwtAuthService.generateTokens(user.id, 'CONSUMER', undefined);

    return {
      success: true,
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: 'CONSUMER',
        companyId: user.consumer.companyId,
        company: user.consumer.company,
      },
    };
  }

  // ── Employer Profile ──────────────────────────────────────────────────────────
  @Post('employer/profile')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async employerProfile(@Request() req: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        consumer: { include: { company: true } },
        wallet: true,
      },
    });

    if (!user || !user.consumer) {
      return { success: false, message: 'Profile not found' };
    }

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        companyId: user.consumer.companyId,
        company: user.consumer.company,
        wallet: user.wallet,
      },
    };
  }

  // ── Get employer rides (rides booked by this consumer) ──────────────────────
  // GET /auth/employer/rides?consumerId=xxx
  // We use a POST with body for simplicity
  @Post('employer/rides')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async employerRides(@Request() req: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      include: { consumer: true },
    });

    if (!user || !user.consumer) {
      return { success: false, rides: [] };
    }

    const rides = await this.prisma.ride.findMany({
      where: { consumerId: user.consumer.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        driver: { include: { user: true } },
        vehicle: true,
        vehicleType: true,
      },
    });

    return { success: true, rides };
  }
}

