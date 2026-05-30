import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SosService } from './sos.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('sos')
@UseGuards(JwtAuthGuard)
export class SosController {
  constructor(private sosService: SosService) {}

  @Post()
  async trigger(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      lat: number;
      lng: number;
      address?: string;
      rideId?: string;
      priority?: 'HIGH' | 'CRITICAL';
    },
  ) {
    return this.sosService.trigger(userId, body);
  }

  @Post(':id/resolve')
  async resolve(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.sosService.resolveOwn(userId, id);
  }

  @Get()
  async myAlerts(@CurrentUser('id') userId: string) {
    return this.sosService.listMine(userId);
  }

  // ── Emergency contacts ───────────────────────────────────────────────

  @Get('contacts')
  async listContacts(@CurrentUser('id') userId: string) {
    return this.sosService.listContacts(userId);
  }

  @Post('contacts')
  async addContact(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      name: string;
      phone: string;
      relationship: string;
      isPrimary?: boolean;
    },
  ) {
    return this.sosService.addContact(userId, body);
  }

  @Delete('contacts/:id')
  async deleteContact(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.sosService.deleteContact(userId, id);
  }
}
