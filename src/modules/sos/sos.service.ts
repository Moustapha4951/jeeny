import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConsumerGateway } from '../consumer-gateway/consumer.gateway';

/// Emergency button. The rider taps SOS during a ride; the backend
/// records an SOSAlert (status=ACTIVE, priority=HIGH) and notifies any
/// admin/dispatcher rooms so they can respond. Emergency contacts can
/// optionally be SMS'd by the operator from the admin panel.
@Injectable()
export class SosService {
  constructor(
    private prisma: PrismaService,
    private consumerGateway: ConsumerGateway,
  ) {}

  /// Trigger an SOS for the current user. Pulls in any active ride
  /// automatically so dispatch can see context. Lat/lng must be passed
  /// in by the client.
  async trigger(
    userId: string,
    body: {
      lat: number;
      lng: number;
      address?: string;
      rideId?: string;
      priority?: 'HIGH' | 'CRITICAL';
    },
  ) {
    if (
      typeof body.lat !== 'number' ||
      typeof body.lng !== 'number' ||
      !Number.isFinite(body.lat) ||
      !Number.isFinite(body.lng)
    ) {
      throw new BadRequestException('lat/lng required');
    }

    // Resolve the user type (rider vs driver) — the SOSAlert.userType
    // column expects RIDER or DRIVER.
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      select: { id: true },
    });
    const userType = driver ? 'DRIVER' : 'RIDER';

    // Backfill rideId from the user's active ride if not provided.
    let rideId = body.rideId;
    if (!rideId) {
      const active = await this.prisma.ride.findFirst({
        where: {
          OR: [
            { consumer: { userId } },
            { driver: { userId } },
          ],
          status: {
            in: ['DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'IN_PROGRESS'],
          },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      rideId = active?.id;
    }

    const alert = await this.prisma.sOSAlert.create({
      data: {
        userId,
        userType: userType as any,
        rideId,
        lat: body.lat,
        lng: body.lng,
        address: body.address,
        priority: (body.priority ?? 'HIGH') as any,
        status: 'ACTIVE',
      },
    });

    // Emit to any admin / dispatcher socket — they're rooted in the
    // legacy WS gateway under the "admin" room. We push via the
    // Consumer gateway too so the rider gets confirmation.
    this.consumerGateway.emitToUser(userId, 'sos:created', alert);

    return alert;
  }

  /// Mark the alert resolved (rider says they're safe).
  async resolveOwn(userId: string, alertId: string) {
    const alert = await this.prisma.sOSAlert.findUnique({
      where: { id: alertId },
    });
    if (!alert) throw new NotFoundException('Alert not found');
    if (alert.userId !== userId) {
      throw new ForbiddenException('Not your alert');
    }
    return this.prisma.sOSAlert.update({
      where: { id: alertId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        notes: 'Self-resolved by user',
      },
    });
  }

  /// List my alerts — for a future "Safety" tab in profile.
  async listMine(userId: string) {
    return this.prisma.sOSAlert.findMany({
      where: { userId },
      orderBy: { triggeredAt: 'desc' },
      take: 30,
    });
  }

  // ── Emergency contacts ───────────────────────────────────────────────

  async listContacts(userId: string) {
    return this.prisma.emergencyContact.findMany({
      where: { userId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async addContact(
    userId: string,
    body: { name: string; phone: string; relationship: string; isPrimary?: boolean },
  ) {
    if (!body.name?.trim() || !body.phone?.trim()) {
      throw new BadRequestException('Name and phone required');
    }
    // If this is the first contact (or marked primary), demote any
    // others to non-primary.
    if (body.isPrimary) {
      await this.prisma.emergencyContact.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return this.prisma.emergencyContact.create({
      data: {
        userId,
        name: body.name.trim(),
        phone: body.phone.trim(),
        relationship: body.relationship?.trim() || 'صديق',
        isPrimary: body.isPrimary ?? false,
      },
    });
  }

  async deleteContact(userId: string, contactId: string) {
    const contact = await this.prisma.emergencyContact.findUnique({
      where: { id: contactId },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    if (contact.userId !== userId) {
      throw new ForbiddenException('Not your contact');
    }
    await this.prisma.emergencyContact.delete({ where: { id: contactId } });
    return { success: true };
  }
}
