import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { DriverModule } from '../driver/driver.module';
import { SupportService } from './support.service';
import { EmployerGateway } from './employer.gateway';

@Module({
  imports: [
    PrismaModule,
    WalletModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
      inject: [ConfigService],
    }),
    forwardRef(() => DriverModule),
  ],
  providers: [SupportService, EmployerGateway],
  exports: [SupportService, EmployerGateway],
})
export class SupportModule {}
