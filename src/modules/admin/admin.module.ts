import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { FirebaseModule } from '../../firebase/firebase.module';
import { RidesModule } from '../rides/rides.module';

@Module({
  imports: [PrismaModule, WalletModule, FirebaseModule, RidesModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
