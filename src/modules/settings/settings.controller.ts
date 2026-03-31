import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@UseGuards(AuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Roles('SUPER_ADMIN')
  async findAll(@Query('category') category?: string) {
    return this.settingsService.findAll(category);
  }

  @Get(':key')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async findOne(@Param('key') key: string) {
    return this.settingsService.findByKey(key);
  }

  @Post()
  @Roles('SUPER_ADMIN')
  async create(@Body() data: { key: string; value: any; category?: string; description?: string }) {
    return this.settingsService.create(data);
  }

  @Put(':key')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async update(@Param('key') key: string, @Body() data: { value: any }) {
    return this.settingsService.update(key, data.value);
  }

  @Delete(':key')
  @Roles('SUPER_ADMIN')
  async remove(@Param('key') key: string) {
    return this.settingsService.remove(key);
  }
}
