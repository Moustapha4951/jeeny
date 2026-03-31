import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    skip?: number;
    take?: number;
    status?: string[];
    name?: string;
    size?: string;
    billingType?: string;
  }) {
    const { skip, take, status, name, size, billingType } = params;

    return this.prisma.company.findMany({
      skip,
      take,
      where: {
        status: status ? { in: status } : undefined,
        name: name ? { contains: name } : undefined,
        size: size ? { equals: size } : undefined,
        billingType: billingType ? { equals: billingType } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        contracts: true,
        employees: true,
        invoices: true,
        wallets: true,
        createdBy: true,
      },
    });
  }

  async findOne(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        contracts: true,
        employees: true,
        invoices: true,
        wallets: true,
        createdBy: true,
        rides: {
          include: {
            rider: true,
            driver: true,
            vehicle: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return company;
  }

  async create(createCompanyDto: Prisma.CompanyCreateInput) {
    return this.prisma.company.create({
      data: createCompanyDto,
      include: {
        createdBy: true,
      },
    });
  }

  async approveCompany(companyId: string) {
    return this.prisma.company.update({
      where: { id: companyId },
      data: {
        status: 'ACTIVE',
        approvedAt: new Date(),
      },
      include: {
        contracts: true,
        employees: true,
        invoices: true,
        wallets: true,
        createdBy: true,
      },
    });
  }

  async suspendCompany(companyId: string) {
    return this.prisma.company.update({
      where: { id: companyId },
      data: {
        status: 'SUSPENDED',
        suspendedAt: new Date(),
      },
      include: {
        contracts: true,
        employees: true,
        invoices: true,
        wallets: true,
        createdBy: true,
      },
    });
  }

  async getCompanyEmployees(companyId: string) {
    return this.prisma.employee.findMany({
      where: { companyId: companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        company: true,
        user: true,
      },
    });
  }

  async getCompanyContracts(companyId: string) {
    return this.prisma.contract.findMany({
      where: { companyId: companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        company: true,
        driver: true,
        vehicle: true,
      },
    });
  }

  async getCompanyInvoices(companyId: string) {
    return this.prisma.invoice.findMany({
      where: { companyId: companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        company: true,
        payments: true,
        rides: true,
      },
    });
  }

  async update(companyId: string, data: Prisma.CompanyUpdateInput) {
    return this.prisma.company.update({
      where: { id: companyId },
      data,
      include: {
        contracts: true,
        employees: true,
        invoices: true,
        wallets: true,
        createdBy: true,
      },
    });
  }

  async delete(companyId: string) {
    return this.prisma.company.delete({
      where: { id: companyId },
    });
  }

  async createContract(contractData: Prisma.ContractCreateInput) {
    return this.prisma.contract.create({
      data: contractData,
      include: {
        company: true,
        driver: true,
        vehicle: true,
      },
    });
  }

  async updateContract(contractId: string, data: Prisma.ContractUpdateInput) {
    return this.prisma.contract.update({
      where: { id: contractId },
      data,
      include: {
        company: true,
        driver: true,
        vehicle: true,
      },
    });
  }

  async createEmployee(employeeData: Prisma.EmployeeCreateInput) {
    return this.prisma.employee.create({
      data: employeeData,
      include: {
        company: true,
        user: true,
      },
    });
  }

  async updateEmployee(employeeId: string, data: Prisma.EmployeeUpdateInput) {
    return this.prisma.employee.update({
      where: { id: employeeId },
      data,
      include: {
        company: true,
        user: true,
      },
    });
  }
}
