import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FirebaseService } from '../../firebase/firebase.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly OTP_EXPIRY_MINUTES = 5;
  private readonly MAX_ATTEMPTS = 3;
  private readonly MAX_REQUESTS_PER_HOUR = 5;

  constructor(
    private prisma: PrismaService,
    private firebase: FirebaseService,
  ) {}

  generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendOTP(phoneNumber: string): Promise<void> {
    // Check rate limiting - count OTPs sent in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOTPs = await this.prisma.oTP.count({
      where: {
        phone: phoneNumber,
        createdAt: { gte: oneHourAgo },
      },
    });
    
    if (recentOTPs >= this.MAX_REQUESTS_PER_HOUR) {
      throw new BadRequestException('Too many OTP requests. Please try again later.');
    }

    // Generate OTP
    const otp = this.generateOTP();
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    // Delete any existing unused OTPs for this phone
    await this.prisma.oTP.deleteMany({
      where: {
        phone: phoneNumber,
        usedAt: null,
      },
    });

    // Store OTP in database
    await this.prisma.oTP.create({
      data: {
        phone: phoneNumber,
        code: otp,
        type: 'LOGIN',
        attempts: 0,
        expiresAt,
      },
    });

    // Send OTP via SMS (using Firebase or SMS gateway)
    try {
      // For development: Log OTP to console
      this.logger.warn(`🔐 OTP for ${phoneNumber}: ${otp} (DEV MODE - Remove in production!)`);
      
      // TODO: Integrate with SMS gateway for production
      // await this.sendSMS(phoneNumber, `Your Jeeny verification code is: ${otp}`);
    } catch (error) {
      this.logger.error('Failed to send OTP:', error);
      throw new BadRequestException('Failed to send OTP. Please try again.');
    }
  }

  async getOTPForDev(phoneNumber: string): Promise<string | null> {
    // DEV ONLY: Get OTP from database for testing
    const otpRecord = await this.prisma.oTP.findFirst({
      where: {
        phone: phoneNumber,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    return otpRecord?.code || null;
  }

  async verifyOTP(phoneNumber: string, otp: string): Promise<boolean> {
    // Find the most recent unused OTP for this phone
    const otpRecord = await this.prisma.oTP.findFirst({
      where: {
        phone: phoneNumber,
        usedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('OTP expired or not found. Please request a new one.');
    }

    // Check if OTP is expired
    if (otpRecord.expiresAt < new Date()) {
      await this.prisma.oTP.delete({ where: { id: otpRecord.id } });
      throw new BadRequestException('OTP expired. Please request a new one.');
    }

    // Check attempts
    if (otpRecord.attempts >= this.MAX_ATTEMPTS) {
      await this.prisma.oTP.delete({ where: { id: otpRecord.id } });
      throw new BadRequestException('Maximum verification attempts exceeded. Please request a new OTP.');
    }

    // Verify OTP
    if (otpRecord.code !== otp) {
      await this.prisma.oTP.update({
        where: { id: otpRecord.id },
        data: { attempts: otpRecord.attempts + 1 },
      });
      throw new BadRequestException('Invalid OTP. Please try again.');
    }

    // OTP is valid, mark as used
    await this.prisma.oTP.update({
      where: { id: otpRecord.id },
      data: { usedAt: new Date() },
    });

    return true;
  }

  async cleanupExpiredOTPs(): Promise<void> {
    // Delete OTPs older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const deleted = await this.prisma.oTP.deleteMany({
      where: {
        createdAt: { lt: oneDayAgo },
      },
    });
    
    this.logger.log(`OTP cleanup: Deleted ${deleted.count} expired OTPs`);
  }
}
