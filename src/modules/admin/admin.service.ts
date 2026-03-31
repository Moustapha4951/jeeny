import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAdminDto, UpdateAdminDto, AdminResponseDto } from './dto/admin.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createAdminDto: CreateAdminDto): Promise<AdminResponseDto> {
    const { userId, role, department } = createAdminDto;

    // Check if user exists in User table
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, firstName: true, lastName: true },
    });

    if (!user) {
      throw new BadRequestException(`User with ID ${userId} not found`);
    }

    // Check if admin already exists for this user
    const existing = await this.prismaService.admin.findUnique({
      where: { userId },
    });
    if (existing) {
      throw new BadRequestException(`Admin already exists for user ${userId}`);
    }

    const admin = await this.prismaService.admin.create({
      data: {
        userId,
        role,
        department,
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

    return this.mapToResponseDto(admin);
  }

  async findAll() {
    const admins = await this.prismaService.admin.findMany({
      include: {
        user: {
          select: {
            phone: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return admins.map(this.mapToResponseDto);
  }

  async findOne(id: string) {
    const admin = await this.prismaService.admin.findUnique({
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

    if (!admin) {
      throw new NotFoundException(`Admin with ID ${id} not found`);
    }

    return this.mapToResponseDto(admin);
  }

  async update(id: string, updateAdminDto: UpdateAdminDto) {
    const admin = await this.prismaService.admin.update({
      where: { id },
      data: updateAdminDto,
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

    return this.mapToResponseDto(admin);
  }

  private mapToResponseDto(admin: any): AdminResponseDto {
    return {
      id: admin.id,
      userId: admin.userId,
      role: admin.role,
      department: admin.department,
      createdAt: admin.createdAt,
      user: {
        phone: admin.user?.phone || '',
        name: admin.user?.firstName && admin.user?.lastName
          ? `${admin.user.firstName} ${admin.user.lastName}`
          : admin.user?.firstName || admin.user?.lastName || '',
      },
    };
  }
}
