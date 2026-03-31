import {
  Controller,
  Get,
  Patch,
  Body,
  Query,
  Param,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { DriversService } from './drivers.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { FindAllDriversDto, UpdateDriverStatusDto, UpdateDriverBalanceDto } from './dto/drivers.dto';
import { WebsocketGateway } from '../websocket/websocket.gateway';

@UseGuards(AuthGuard, RolesGuard)
@Controller('admin/drivers')
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'DRIVER_MANAGEMENT')
  async findAll(@Query() query: FindAllDriversDto) {
    return this.driversService.findAll(query);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'DRIVER_MANAGEMENT')
  async findOne(@Param('id') id: string) {
    return this.driversService.findOne(id);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'DRIVER_MANAGEMENT')
  async updateStatus(
    @Param('id') driverId: string,
    @Body() updateDto: UpdateDriverStatusDto,
  ) {
    const driver = await this.driversService.updateStatus(driverId, updateDto);

    // Broadcast driver status change via WebSocket
    this.websocketGateway.emitToAdmin('driver_status_updated', {
      driverId,
      status: updateDto.status,
    });

    return driver;
  }

  @Post(':id/balance/adjust')
  @Roles('SUPER_ADMIN', 'ADMIN', 'DRIVER_MANAGEMENT', 'FINANCE')
  async adjustBalance(
    @Param('id') driverId: string,
    @Body() dto: UpdateDriverBalanceDto,
    @CurrentUser() user: any,
  ) {
    const result = await this.driversService.adjustBalance(driverId, dto, user);

    // Broadcast balance update
    this.websocketGateway.emitToAdmin('driver_balance_updated', {
      driverId,
      amount: dto.amount,
      reason: dto.reason,
      newBalance: result.newBalance,
    });

    return result;
  }

  @Get('online')
  @Roles('SUPER_ADMIN', 'ADMIN', 'DRIVER_MANAGEMENT')
  async getOnlineDrivers(@Query('includeLocation') includeLocation?: string) {
    return this.driversService.findOnline(includeLocation === 'true');
  }
}
