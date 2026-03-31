import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        wallet: true,
        savedPlaces: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByPhoneNumber(phoneNumber: string) {
    return this.prisma.user.findUnique({
      where: { phoneNumber },
      include: {
        wallet: true,
      },
    });
  }

  async updateProfile(userId: string, data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    dateOfBirth?: Date;
    gender?: string;
    profilePicture?: string;
  }) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  async updateFcmToken(userId: string, fcmToken: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { fcmToken },
    });
  }

  async getSavedPlaces(userId: string) {
    return this.prisma.savedPlace.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addSavedPlace(userId: string, data: {
    label: string;
    address: string;
    latitude: number;
    longitude: number;
  }) {
    return this.prisma.savedPlace.create({
      data: {
        ...data,
        userId,
      },
    });
  }

  async updateSavedPlace(placeId: string, userId: string, data: {
    label?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
  }) {
    const place = await this.prisma.savedPlace.findFirst({
      where: { id: placeId, userId },
    });

    if (!place) {
      throw new NotFoundException('Saved place not found');
    }

    return this.prisma.savedPlace.update({
      where: { id: placeId },
      data,
    });
  }

  async deleteSavedPlace(placeId: string, userId: string) {
    const place = await this.prisma.savedPlace.findFirst({
      where: { id: placeId, userId },
    });

    if (!place) {
      throw new NotFoundException('Saved place not found');
    }

    await this.prisma.savedPlace.delete({
      where: { id: placeId },
    });

    return { message: 'Saved place deleted successfully' };
  }

  async uploadDocument(userId: string, documentType: string, documentUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        [`${documentType}Url`]: documentUrl,
      },
    });
  }
}
