import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

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
  private readonly ACCESS_TOKEN_EXPIRY: string;
  private readonly REFRESH_TOKEN_EXPIRY = '7d';

  constructor(
    private jwtService: NestJwtService,
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.ACCESS_TOKEN_EXPIRY = this.configService.get<string>('JWT_EXPIRY') || '30d';
  }

  async generateTokens(
    userId: string,
    role: string,
    deviceInfo?: string,
  ): Promise<TokenPair> {
    // Generate unique session token
    const sessionToken = `${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const refreshToken = this.jwtService.sign(
      { userId, sessionId: sessionToken },
      { expiresIn: this.REFRESH_TOKEN_EXPIRY },
    );
    
    // Create session with refresh token stored in database
    const session = await this.prisma.session.create({
      data: {
        userId,
        token: sessionToken,
        refreshToken: refreshToken, // Store refresh token in database
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

    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    try {
      const decoded = this.jwtService.verify(refreshToken);
      const sessionToken = decoded.sessionId;

      // Verify refresh token in database
      const session = await this.prisma.session.findFirst({
        where: { 
          token: sessionToken,
          refreshToken: refreshToken,
        },
        include: { 
          user: {
            include: {
              admin: true,
              driver: true,
              employee: true,
              consumer: true,
            }
          }
        },
      });

      if (!session || session.expiresAt < new Date()) {
        throw new UnauthorizedException('Session expired');
      }

      // Determine user role from relations
      let userRole = 'CONSUMER'; // default
      if (session.user.admin) userRole = 'ADMIN';
      else if (session.user.driver) userRole = 'DRIVER';
      else if (session.user.employee) userRole = 'EMPLOYEE';

      // Generate new tokens
      return this.generateTokens(
        session.userId,
        userRole,
        session.deviceInfo as string,
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
    // Delete session from database (refresh token is stored in the session)
    await this.prisma.session.delete({
      where: { id: sessionId },
    });
  }

  async logoutAllSessions(userId: string): Promise<void> {
    // Delete all sessions (refresh tokens are stored in sessions)
    await this.prisma.session.deleteMany({
      where: { userId },
    });
  }

  async getUserSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
