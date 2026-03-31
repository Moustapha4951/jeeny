import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { DatabaseModule } from '../config/database.config';

@Module({
  imports: [DatabaseModule.forRoot()],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
