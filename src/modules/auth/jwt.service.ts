import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

export interface JwtPayload {
  userId: string;
  role: string;
  sessionId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class JwtAuthService {
  private readonly ACCESS_TOKEN_EXPIRY = '15m';
  private readonly REFRESH_TOKEN_EXPIRY = '7d';

  constructor(
    private jwtService: NestJwtService,
    private prisma: PrismaService,
    private redis: RedisService,
    private configService: ConfigService,
  ) {}

  async generateTokens(
    userId: string,
    role: string,
    deviceInfo?: string,
  ): Promise<TokenPair> {
    // Create session
    const session = await this.prisma.session.create({
      data: {
        userId,
        deviceInfo: deviceInfo || 'Unknown',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    const payload: JwtPayload = {
      userId,
      role,
      sessionId: session.id,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = this.jwtService.sign(
      { sessionId: session.id },
      { expiresIn: this.REFRESH_TOKEN_EXPIRY },
    );

    // Store refresh token in Redis
    await this.redis.set(
      `refresh:${session.id}`,
      refreshToken,
      7 * 24 * 60 * 60, // 7 days in seconds
    );

    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    try {
      const decoded = this.jwtService.verify(refreshToken);
      const sessionId = decoded.sessionId;

      // Verify refresh token in Redis
      const storedToken = await this.redis.get(`refresh:${sessionId}`);
      if (!storedToken || storedToken !== refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Get session
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        include: { user: true },
      });

      if (!session || session.expiresAt < new Date()) {
        await this.redis.del(`refresh:${sessionId}`);
        throw new UnauthorizedException('Session expired');
      }

      // Generate new tokens
      return this.generateTokens(
        session.userId,
        session.user.role,
        session.deviceInfo,
      );
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async validateToken(token: string): Promise<JwtPayload> {
    try {
      const payload = this.jwtService.verify(token);
      
      // Check if session is still valid
      const session = await this.prisma.session.findUnique({
        where: { id: payload.sessionId },
      });

      if (!session || session.expiresAt < new Date()) {
        throw new UnauthorizedException('Session expired');
      }

      return payload;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async logout(sessionId: string): Promise<void> {
    // Delete session from database
    await this.prisma.session.delete({
      where: { id: sessionId },
    });

    // Delete refresh token from Redis
    await this.redis.del(`refresh:${sessionId}`);
  }

  async logoutAllSessions(userId: string): Promise<void> {
    // Get all user sessions
    const sessions = await this.prisma.session.findMany({
      where: { userId },
    });

    // Delete all sessions
    await this.prisma.session.deleteMany({
      where: { userId },
    });

    // Delete all refresh tokens from Redis
    await Promise.all(
      sessions.map((session) => this.redis.del(`refresh:${session.id}`)),
    );
  }

  async getUserSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
