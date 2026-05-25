import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AssignmentMetric, AssignmentStatus } from '@prisma/client';

/**
 * Driver assignments / challenges. Admin creates an assignment with a metric
 * (rides, earnings, hours, rating), a target, a reward, and a window.
 * Drivers progress automatically as they complete rides.
 */
@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Driver-facing ────────────────────────────────────────────────────────

  /**
   * List active assignments visible to a driver, with their progress.
   * "Visible" means: status=ACTIVE, currently in the time window, and either
   * targeted at this driver or to all drivers (driverIds=[]).
   */
  async listForDriver(userId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver profile not found');
    }

    const now = new Date();
    const assignments = await this.prisma.assignment.findMany({
      where: {
        status: AssignmentStatus.ACTIVE,
        startsAt: { lte: now },
        endsAt: { gte: now },
        OR: [
          { driverIds: { isEmpty: true } },
          { driverIds: { has: driver.id } },
        ],
      },
      orderBy: { endsAt: 'asc' },
    });

    // Fetch any existing progress rows in one query.
    const progressRows = await this.prisma.driverAssignmentProgress.findMany({
      where: {
        driverId: driver.id,
        assignmentId: { in: assignments.map((a) => a.id) },
      },
    });
    const progressById = new Map(
      progressRows.map((p) => [p.assignmentId, p]),
    );

    return assignments.map((a) => {
      const progress = progressById.get(a.id);
      const current = Number(progress?.currentValue ?? 0);
      const target = Number(a.targetValue);
      const percent = target > 0 ? Math.min(100, (current / target) * 100) : 0;

      return {
        id: a.id,
        title: {
          ar: a.titleAr,
          fr: a.titleFr,
          en: a.titleEn,
        },
        description: {
          ar: a.descriptionAr,
          fr: a.descriptionFr,
          en: a.descriptionEn,
        },
        metric: a.metric,
        target,
        current,
        percent: Math.round(percent),
        reward: {
          type: a.rewardType,
          amount: Number(a.rewardAmount),
          description: {
            ar: a.rewardDescriptionAr,
            fr: a.rewardDescriptionFr,
            en: a.rewardDescriptionEn,
          },
        },
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        isCompleted: progress?.isCompleted ?? false,
        isClaimed: progress?.isClaimed ?? false,
        completedAt: progress?.completedAt,
      };
    });
  }

  /**
   * Driver claims their reward for a completed assignment.
   * For WALLET_CREDIT rewards we add to the driver wallet here too.
   */
  async claimReward(userId: string, assignmentId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      select: { id: true, userId: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver profile not found');
    }

    const progress = await this.prisma.driverAssignmentProgress.findUnique({
      where: {
        assignmentId_driverId: { assignmentId, driverId: driver.id },
      },
      include: { assignment: true },
    });

    if (!progress) {
      throw new NotFoundException('Assignment progress not found');
    }
    if (!progress.isCompleted) {
      throw new BadRequestException('Assignment not yet completed');
    }
    if (progress.isClaimed) {
      throw new BadRequestException('Reward already claimed');
    }

    // For wallet-credit rewards, deposit into the driver's wallet.
    if (progress.assignment.rewardType === 'WALLET_CREDIT') {
      const amount = Number(progress.assignment.rewardAmount);
      const wallet = await this.prisma.wallet.findUnique({
        where: { userId: driver.userId },
      });
      if (wallet) {
        await this.prisma.$transaction(async (tx) => {
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: amount } },
          });
          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              userId: driver.userId,
              type: 'BONUS',
              amount,
              currency: 'MRU',
              status: 'COMPLETED',
              description: 'Assignment reward',
              descriptionAr: 'مكافأة مهمة مكتملة',
            },
          });
        });
      }
    }

    return this.prisma.driverAssignmentProgress.update({
      where: { id: progress.id },
      data: { isClaimed: true, claimedAt: new Date() },
    });
  }

  // ── Hooks invoked by the rides system to update progress ────────────────

  /**
   * Increment a driver's progress on every active assignment for the given
   * metric. Called from the rides flow when a ride completes.
   */
  async onRideCompleted(args: {
    driverId: string;
    fareAmount: number;
    durationMinutes: number;
  }) {
    const now = new Date();
    const active = await this.prisma.assignment.findMany({
      where: {
        status: AssignmentStatus.ACTIVE,
        startsAt: { lte: now },
        endsAt: { gte: now },
        OR: [
          { driverIds: { isEmpty: true } },
          { driverIds: { has: args.driverId } },
        ],
      },
    });

    for (const a of active) {
      let increment = 0;
      switch (a.metric) {
        case AssignmentMetric.RIDES_COMPLETED:
          increment = 1;
          break;
        case AssignmentMetric.EARNINGS:
          increment = args.fareAmount;
          break;
        case AssignmentMetric.ONLINE_HOURS:
          increment = args.durationMinutes / 60;
          break;
        case AssignmentMetric.RATING_AVERAGE:
          // Rating is averaged elsewhere; don't bump per ride
          continue;
      }
      if (increment <= 0) continue;

      await this.prisma.driverAssignmentProgress.upsert({
        where: {
          assignmentId_driverId: {
            assignmentId: a.id,
            driverId: args.driverId,
          },
        },
        create: {
          assignmentId: a.id,
          driverId: args.driverId,
          currentValue: increment,
        },
        update: {
          currentValue: { increment },
        },
      });

      // Mark complete if the threshold is met (read back to evaluate).
      const updated = await this.prisma.driverAssignmentProgress.findUnique({
        where: {
          assignmentId_driverId: {
            assignmentId: a.id,
            driverId: args.driverId,
          },
        },
      });
      if (
        updated &&
        !updated.isCompleted &&
        Number(updated.currentValue) >= Number(a.targetValue)
      ) {
        await this.prisma.driverAssignmentProgress.update({
          where: { id: updated.id },
          data: { isCompleted: true, completedAt: new Date() },
        });
        this.logger.log(
          `Driver ${args.driverId} completed assignment ${a.id}`,
        );
      }
    }
  }

  // ── Admin-facing ────────────────────────────────────────────────────────

  async listForAdmin() {
    return this.prisma.assignment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { progress: true } },
      },
    });
  }

  async create(adminUserId: string, dto: CreateAssignmentDto) {
    const admin = await this.prisma.admin.findUnique({
      where: { userId: adminUserId },
      select: { id: true },
    });

    return this.prisma.assignment.create({
      data: {
        titleAr: dto.titleAr,
        titleFr: dto.titleFr,
        titleEn: dto.titleEn,
        descriptionAr: dto.descriptionAr,
        descriptionFr: dto.descriptionFr,
        descriptionEn: dto.descriptionEn,
        metric: dto.metric,
        targetValue: dto.targetValue,
        rewardType: dto.rewardType ?? 'WALLET_CREDIT',
        rewardAmount: dto.rewardAmount,
        rewardDescriptionAr: dto.rewardDescriptionAr,
        rewardDescriptionFr: dto.rewardDescriptionFr,
        rewardDescriptionEn: dto.rewardDescriptionEn,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        driverIds: dto.driverIds ?? [],
        cityFilter: dto.cityFilter,
        status: dto.status ?? 'ACTIVE',
        createdById: admin?.id,
      },
    });
  }

  async update(id: string, dto: Partial<CreateAssignmentDto>) {
    return this.prisma.assignment.update({
      where: { id },
      data: {
        titleAr: dto.titleAr,
        titleFr: dto.titleFr,
        titleEn: dto.titleEn,
        descriptionAr: dto.descriptionAr,
        descriptionFr: dto.descriptionFr,
        descriptionEn: dto.descriptionEn,
        metric: dto.metric,
        targetValue: dto.targetValue,
        rewardType: dto.rewardType,
        rewardAmount: dto.rewardAmount,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        driverIds: dto.driverIds,
        status: dto.status,
      },
    });
  }

  async archive(id: string) {
    return this.prisma.assignment.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  }
}

// ── DTO ────────────────────────────────────────────────────────────────────

export interface CreateAssignmentDto {
  titleAr: string;
  titleFr?: string;
  titleEn?: string;
  descriptionAr?: string;
  descriptionFr?: string;
  descriptionEn?: string;
  metric: AssignmentMetric;
  targetValue: number;
  rewardType?: 'WALLET_CREDIT' | 'RATING_BOOST' | 'COMMISSION_DISCOUNT' | 'CUSTOM';
  rewardAmount: number;
  rewardDescriptionAr?: string;
  rewardDescriptionFr?: string;
  rewardDescriptionEn?: string;
  startsAt: string;
  endsAt: string;
  driverIds?: string[];
  cityFilter?: string;
  status?: AssignmentStatus;
}
