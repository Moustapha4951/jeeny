import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { EmployeeService } from './employees.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateEmployeeDto, UpdateEmployeeDto, EmployeeResponseDto } from './dto/employees.dto';

@UseGuards(AuthGuard, RolesGuard)
@Controller('admin/employees')
export class EmployeesController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Post()
  @Roles('SUPER_ADMIN')
  async create(@Body() createDto: CreateEmployeeDto): Promise<EmployeeResponseDto> {
    return this.employeeService.create(createDto);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN')
  async findAll() {
    return this.employeeService.findAll();
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async findOne(@Param('id') id: string) {
    return this.employeeService.findOne(id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async update(@Param('id') id: string, @Body() updateDto: UpdateEmployeeDto) {
    return this.employeeService.update(id, updateDto);
  }
}
