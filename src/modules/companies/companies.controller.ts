import { Controller, Get, Param, Query, Post, Body, UseGuards } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { AuthGuard } from '../auth/auth.guard';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Controller('companies')
@UseGuards(AuthGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  async findAll(@Query() query: any) {
    return this.companiesService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Post()
  async create(@Body() createCompanyDto: CreateCompanyDto) {
    return this.companiesService.create(createCompanyDto);
  }

  @Post(':id/approve')
  async approveCompany(@Param('id') id: string) {
    return this.companiesService.approveCompany(id);
  }

  @Post(':id/suspend')
  async suspendCompany(@Param('id') id: string) {
    return this.companiesService.suspendCompany(id);
  }

  @Get('employees/:companyId')
  async getCompanyEmployees(@Param('companyId') companyId: string) {
    return this.companiesService.getCompanyEmployees(companyId);
  }

  @Get('contracts/:companyId')
  async getCompanyContracts(@Param('companyId') companyId: string) {
    return this.companiesService.getCompanyContracts(companyId);
  }

  @Get('invoices/:companyId')
  async getCompanyInvoices(@Param('companyId') companyId: string) {
    return this.companiesService.getCompanyInvoices(companyId);
  }
}
