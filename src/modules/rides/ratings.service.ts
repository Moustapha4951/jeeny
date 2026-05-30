import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Ratings for completed rides. Riders rate their driver, drivers rate
 * their rider. After a rating is recorded the target user's aggregate
 * rating (Driver.rating or Consumer.rating) is recomputed as a simple
 * arithmetic mean of all ratings ever received.
 */
@Injectable()
export class RatingsService {
  constructor(private prisma: PrismaService) {}

  /// Active tags for the rating UI. `applies` filters to DRIVER (rider
  /// rating their driver) or RIDER (driver rating their rider). `BOTH`
  /// is included for shared tags.
  async getTags(applies: 'DRIVER' | 'RIDER') {
    return this.prisma.ratingTag.findMany({
      where: {
        isActive: true,
        OR: [{ applies }, { applies: 'BOTH' as any }],
      },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  /// Returns the rating this user already left for the ride (if any),
  /// so the client can hide the rate prompt on revisit.
  async getMyRating(rideId: string, fromUserId: string) {
    return this.prisma.rating.findFirst({
      where: { rideId, fromUserId },
    });
  }

  async rateRide(
    rideId: string,
    fromUserId: string,
    fromRole: 'CONSUMER' | 'DRIVER',
    body: { score: number; comment?: string; tags?: string[] },
  ) {
    if (!Number.isInteger(body.score) || body.score < 1 || body.score > 5) {
      throw new BadRequestException('Score must be an integer between 1 and 5');
    }

    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        consumer: { select: { id: true, userId: true } },
        driver: { select: { id: true, userId: true } },
      },
    });
    if (!ride) throw new NotFoundException('Ride not found');
    if (ride.status !== 'COMPLETED') {
      throw new BadRequestException('Ride is not completed');
    }

    // Make sure the caller is part of this ride and resolve the target
    let toUserId: string | null = null;
    let type: 'RIDER_TO_DRIVER' | 'DRIVER_TO_RIDER';
    if (fromRole === 'DRIVER') {
      if (ride.driver?.userId !== fromUserId) {
        throw new ForbiddenException('Not your ride');
      }
      toUserId = ride.consumer?.userId ?? null;
      type = 'DRIVER_TO_RIDER';
    } else {
      if (ride.consumer?.userId !== fromUserId) {
        throw new ForbiddenException('Not your ride');
      }
      toUserId = ride.driver?.userId ?? null;
      type = 'RIDER_TO_DRIVER';
    }
    if (!toUserId) {
      throw new BadRequestException('Cannot rate: counterparty missing');
    }

    // One rating per (ride, fromUser) — replace if it already exists
    const existing = await this.prisma.rating.findFirst({
      where: { rideId, fromUserId },
    });
    const rating = existing
      ? await this.prisma.rating.update({
          where: { id: existing.id },
          data: {
            score: body.score,
            comment: body.comment ?? null,
            tags: body.tags ?? [],
          },
        })
      : await this.prisma.rating.create({
          data: {
            rideId,
            fromUserId,
            toUserId,
            type: type as any,
            score: body.score,
            comment: body.comment ?? null,
            tags: body.tags ?? [],
          },
        });

    // Recompute aggregate for the target
    if (type === 'RIDER_TO_DRIVER' && ride.driver) {
      await this.recomputeDriverRating(ride.driver.id, toUserId);
    } else if (type === 'DRIVER_TO_RIDER' && ride.consumer) {
      await this.recomputeConsumerRating(ride.consumer.id, toUserId);
    }

    return rating;
  }

  private async recomputeDriverRating(driverId: string, userId: string) {
    const agg = await this.prisma.rating.aggregate({
      where: { toUserId: userId, type: 'RIDER_TO_DRIVER' },
      _avg: { score: true },
    });
    const avg = agg._avg.score ?? 5;
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { rating: Number(avg.toFixed(1)) },
    });
  }

  private async recomputeConsumerRating(consumerId: string, userId: string) {
    const agg = await this.prisma.rating.aggregate({
      where: { toUserId: userId, type: 'DRIVER_TO_RIDER' },
      _avg: { score: true },
    });
    const avg = agg._avg.score ?? 5;
    await this.prisma.consumer.update({
      where: { id: consumerId },
      data: { rating: Number(avg.toFixed(1)) },
    });
  }
}
