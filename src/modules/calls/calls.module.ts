import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
