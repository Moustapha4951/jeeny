import { Module } from '@nestjs/common';
import { DriverController } from './driver.controller';
import { DriverService } from './driver.service';
import { DriverGateway } from './driver.gateway';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [DriverController],
  providers: [DriverService, DriverGateway],
  exports: [DriverService, DriverGateway],
})
export class DriverModule {}
