import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class IntercityService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    skip?: number;
    take?: number;
    status?: string[];
    origin?: string;
    destination?: string;
    date?: Date;
    driverId?: string;
  }) {
    const { skip, take, status, origin, destination, date, driverId } = params;

    return this.prisma.intercityTrip.findMany({
      skip,
      take,
      where: {
        status: status ? { in: status } : undefined,
        origin: origin ? { contains: origin } : undefined,
        destination: destination ? { contains: destination } : undefined,
        date: date ? { equals: date } : undefined,
        driverId: driverId ? { equals: driverId } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        driver: true,
        vehicle: true,
        passengers: {
          include: {
            user: true,
          },
        },
        bookings: {
          include: {
            user: true,
            payment: true,
          },
        },
      },
    });
  }

  async findOne(tripId: string) {
    const trip = await this.prisma.intercityTrip.findUnique({
      where: { id: tripId },
      include: {
        driver: true,
        vehicle: true,
        passengers: {
          include: {
            user: true,
          },
        },
        bookings: {
          include: {
            user: true,
            payment: true,
          },
        },
        route: true,
      },
    });

    if (!trip) {
      throw new NotFoundException('Intercity trip not found');
    }

    return trip;
  }

  async create(createIntercityTripDto: Prisma.IntercityTripCreateInput) {
    return this.prisma.intercityTrip.create({
      data: createIntercityTripDto,
      include: {
        driver: true,
        vehicle: true,
        passengers: {
          include: {
            user: true,
          },
        },
        bookings: {
          include: {
            user: true,
            payment: true,
          },
        },
        route: true,
      },
    });
  }

  async confirmTrip(tripId: string) {
    return this.prisma.intercityTrip.update({
      where: { id: tripId },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      },
      include: {
        driver: true,
        vehicle: true,
        passengers: {
          include: {
            user: true,
          },
        },
        bookings: {
          include: {
            user: true,
            payment: true,
          },
        },
        route: true,
      },
    });
  }

  async cancelTrip(tripId: string, cancelData: { cancelledBy: string; reason?: string }) {
    const { cancelledBy, reason } = cancelData;

    return this.prisma.intercityTrip.update({
      where: { id: tripId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: cancelledBy,
        cancellationReason: reason,
      },
      include: {
        driver: true,
        vehicle: true,
        passengers: {
          include: {
            user: true,
          },
        },
        bookings: {
          include: {
            user: true,
            payment: true,
          },
        },
        route: true,
      },
    });
  }

  async getAvailableTrips(params: {
    origin: string;
    destination: string;
    date?: Date;
    passengerCount?: number;
  }) {
    const { origin, destination, date, passengerCount } = params;

    return this.prisma.intercityTrip.findMany({
      where: {
        status: 'AVAILABLE',
        origin: origin ? { equals: origin } : undefined,
        destination: destination ? { equals: destination } : undefined,
        date: date ? { equals: date } : undefined,
        availableSeats: {
          gte: passengerCount ? passengerCount : 1,
        },
      },
      include: {
        driver: true,
        vehicle: true,
        route: true,
      },
    });
  }

  async getRoutes(params: {
    origin?: string;
    destination?: string;
    skip?: number;
    take?: number;
  }) {
    const { origin, destination, skip, take } = params;

    return this.prisma.intercityRoute.findMany({
      skip,
      take,
      where: {
        origin: origin ? { contains: origin } : undefined,
        destination: destination ? { contains: destination } : undefined,
      },
      orderBy: { popularity: 'desc' },
    });
  }

  async createBooking(bookingData: Prisma.IntercityBookingCreateInput) {
    return this.prisma.intercityBooking.create({
      data: bookingData,
      include: {
        user: true,
        payment: true,
        trip: true,
      },
    });
  }

  async updateBooking(bookingId: string, data: Prisma.IntercityBookingUpdateInput) {
    return this.prisma.intercityBooking.update({
      where: { id: bookingId },
      data,
      include: {
        user: true,
        payment: true,
        trip: true,
      },
    });
  }

  async createRoute(routeData: Prisma.IntercityRouteCreateInput) {
    return this.prisma.intercityRoute.create({
      data: routeData,
    });
  }

  async updateRoute(routeId: string, data: Prisma.IntercityRouteUpdateInput) {
    return this.prisma.intercityRoute.update({
      where: { id: routeId },
      data,
    });
  }
}
