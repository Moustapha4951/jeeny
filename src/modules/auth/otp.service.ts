import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { FirebaseService } from '../../firebase/firebase.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly OTP_EXPIRY = 300; // 5 minutes in seconds
  private readonly MAX_ATTEMPTS = 3;
  private readonly RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds
  private readonly MAX_REQUESTS_PER_HOUR = 5;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private firebase: FirebaseService,
  ) {}

  generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendOTP(phoneNumber: string): Promise<void> {
    // Check rate limiting
    const rateLimitKey = `otp:ratelimit:${phoneNumber}`;
    const requestCount = await this.redis.get(rateLimitKey);
    
    if (requestCount && parseInt(requestCount) >= this.MAX_REQUESTS_PER_HOUR) {
      throw new BadRequestException('Too many OTP requests. Please try again later.');
    }

    // Generate OTP
    const otp = this.generateOTP();
    const otpKey = `otp:${phoneNumber}`;
    const attemptsKey = `otp:attempts:${phoneNumber}`;

    // Store OTP in Redis with expiry
    await this.redis.set(otpKey, otp, this.OTP_EXPIRY);
    await this.redis.set(attemptsKey, '0', this.OTP_EXPIRY);

    // Increment rate limit counter
    const currentCount = requestCount ? parseInt(requestCount) : 0;
    await this.redis.set(rateLimitKey, (currentCount + 1).toString(), this.RATE_LIMIT_WINDOW);

    // Send OTP via SMS (using Firebase or SMS gateway)
    try {
      // For development: Log OTP to console AND return it
      this.logger.warn(`🔐 OTP for ${phoneNumber}: ${otp} (DEV MODE - Remove in production!)`);
      
      // TODO: Integrate with SMS gateway for production
      // await this.sendSMS(phoneNumber, `Your Jeeny verification code is: ${otp}`);
    } catch (error) {
      this.logger.error('Failed to send OTP:', error);
      throw new BadRequestException('Failed to send OTP. Please try again.');
    }
  }

  async getOTPForDev(phoneNumber: string): Promise<string | null> {
    // DEV ONLY: Get OTP from Redis for testing
    const otpKey = `otp:${phoneNumber}`;
    return await this.redis.get(otpKey);
  }

  async verifyOTP(phoneNumber: string, otp: string): Promise<boolean> {
    const otpKey = `otp:${phoneNumber}`;
    const attemptsKey = `otp:attempts:${phoneNumber}`;

    // Check if OTP exists
    const storedOTP = await this.redis.get(otpKey);
    if (!storedOTP) {
      throw new BadRequestException('OTP expired or not found. Please request a new one.');
    }

    // Check attempts
    const attempts = await this.redis.get(attemptsKey);
    const attemptCount = attempts ? parseInt(attempts) : 0;

    if (attemptCount >= this.MAX_ATTEMPTS) {
      await this.redis.del(otpKey);
      await this.redis.del(attemptsKey);
      throw new BadRequestException('Maximum verification attempts exceeded. Please request a new OTP.');
    }

    // Verify OTP
    if (storedOTP !== otp) {
      await this.redis.set(attemptsKey, (attemptCount + 1).toString(), this.OTP_EXPIRY);
      throw new BadRequestException('Invalid OTP. Please try again.');
    }

    // OTP is valid, clean up
    await this.redis.del(otpKey);
    await this.redis.del(attemptsKey);

    return true;
  }

  async cleanupExpiredOTPs(): Promise<void> {
    // This will be called by a scheduled job
    // Redis TTL handles automatic cleanup, but we can add additional logic here if needed
    this.logger.log('OTP cleanup job executed');
  }
}
