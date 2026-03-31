import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeeDto, UpdateEmployeeDto, EmployeeResponseDto } from './dto/employees.dto';

@Injectable()
export class EmployeeService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createDto: CreateEmployeeDto): Promise<EmployeeResponseDto> {
    const { userId, employeeId, role, department, salary, hireDate } = createDto;

    // Check if user exists
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, firstName: true, lastName: true },
    });
    if (!user) {
      throw new BadRequestException(`User with ID ${userId} not found`);
    }

    // Check employeeId uniqueness
    const existing = await this.prismaService.employee.findUnique({
      where: { employeeId },
    });
    if (existing) {
      throw new BadRequestException(`Employee with ID ${employeeId} already exists`);
    }

    const employee = await this.prismaService.employee.create({
      data: {
        userId,
        employeeId,
        role,
        department,
        salary: salary || '0',
        hireDate: hireDate ? new Date(hireDate) : new Date(),
      },
      include: {
        user: {
          select: {
            phone: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return this.mapToResponseDto(employee);
  }

  async findAll() {
    const employees = await this.prismaService.employee.findMany({
      include: {
        user: {
          select: {
            phone: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { hireDate: 'desc' },
    });

    return employees.map(this.mapToResponseDto);
  }

  async findOne(id: string) {
    const employee = await this.prismaService.employee.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            phone: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }

    return this.mapToResponseDto(employee);
  }

  async update(id: string, updateDto: UpdateEmployeeDto) {
    const employee = await this.prismaService.employee.update({
      where: { id },
      data: updateDto,
      include: {
        user: {
          select: {
            phone: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return this.mapToResponseDto(employee);
  }

  private mapToResponseDto(employee: any): EmployeeResponseDto {
    return {
      id: employee.id,
      userId: employee.userId,
      employeeId: employee.employeeId,
      role: employee.role,
      department: employee.department,
      salary: employee.salary,
      hireDate: employee.hireDate,
      isOnDuty: employee.isOnDuty,
      createdAt: employee.createdAt,
      user: {
        phone: employee.user?.phone || '',
        name: employee.user?.firstName && employee.user?.lastName
          ? `${employee.user.firstName} ${employee.user.lastName}`
          : employee.user?.firstName || employee.user?.lastName || '',
      },
    };
  }
}
