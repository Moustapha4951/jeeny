import { Module, Global, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { EmployeeController } from './employee.controller';
import { OtpService } from './otp.service';
import { MoorsylService } from './moorsyl.service';
import { JwtAuthService } from './jwt.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { DriverModule } from '../driver/driver.module';
import { AdminModule } from '../admin/admin.module';

@Global()
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    HttpModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { 
          expiresIn: configService.get<string>('JWT_EXPIRY') || '30d',
        },
      }),
      inject: [ConfigService],
    }),
    forwardRef(() => DriverModule),
    forwardRef(() => AdminModule),
  ],
  controllers: [AuthController, EmployeeController],
  providers: [OtpService, MoorsylService, JwtAuthService, JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [OtpService, JwtAuthService, JwtAuthGuard, RolesGuard, PassportModule],
})
export class AuthModule {}
