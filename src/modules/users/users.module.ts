import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { DriversService } from './drivers.service';
import { AdminsService } from './admins.service';
import { UsersController } from './users.controller';
import { DriversController } from './drivers.controller';

@Module({
  controllers: [UsersController, DriversController],
  providers: [UsersService, DriversService, AdminsService],
  exports: [UsersService, DriversService, AdminsService],
})
export class UsersModule {}
