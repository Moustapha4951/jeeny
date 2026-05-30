import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConsumerGateway } from '../consumer-gateway/consumer.gateway';
import { DriverGateway } from '../driver/driver.gateway';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { randomBytes } from 'crypto';

/// In-app voice calls between rider and driver, powered by Agora.
/// The backend issues short-lived RTC tokens per call so the SDK on
/// either side can join the same channel. The Call row is created on
/// initiate and updated on accept/reject/end.
@Injectable()
export class CallsService {
  constructor(
    private prisma: PrismaService,
    private consumerGateway: ConsumerGateway,
    private driverGateway: DriverGateway,
  ) {}

  private get appId(): string {
    return process.env.AGORA_APP_ID ?? '';
  }
  private get certificate(): string {
    return process.env.AGORA_APP_CERTIFICATE ?? '';
  }

  /// Issue a 1-hour RTC token. uid = numeric id Agora needs (we use a
  /// hash of the userId so a given user always gets the same uid).
  private issueToken(channelName: string, agoraUid: number): string {
    if (!this.appId || !this.certificate) {
      throw new InternalServerErrorException('Agora credentials not configured');
    }
    const expireSeconds = 3600;
    const now = Math.floor(Date.now() / 1000);
    return RtcTokenBuilder.buildTokenWithUid(
      this.appId,
      this.certificate,
      channelName,
      agoraUid,
      RtcRole.PUBLISHER,
      now + expireSeconds,
      now + expireSeconds,
    );
  }

  /// Stable numeric uid derived from a userId UUID.
  private uidForUser(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = (hash << 5) - hash + userId.charCodeAt(i);
      hash |= 0;
    }
    // Agora requires positive 32-bit. Avoid zero — Agora reserves it.
    const v = Math.abs(hash);
    return v === 0 ? 1 : v;
  }

  /// Initiate a call from the caller (rider or driver) to the
  /// counterparty in this ride. Creates an Agora channel and notifies
  /// the recipient.
  async initiateRideCall(
    rideId: string,
    callerUserId: string,
    callType: 'VOICE' | 'VIDEO' = 'VOICE',
  ) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        consumer: { include: { user: true } },
        driver: { include: { user: true } },
      },
    });
    if (!ride) throw new NotFoundException('Ride not found');

    const consumerUser = ride.consumer?.user;
    const driverUser = ride.driver?.user;
    if (!consumerUser || !driverUser) {
      throw new BadRequestException(
        'Call unavailable until a driver is assigned',
      );
    }
    if (
      callerUserId !== consumerUser.id &&
      callerUserId !== driverUser.id
    ) {
      throw new ForbiddenException('Not a participant of this ride');
    }
    const callerType: 'RIDER' | 'DRIVER' =
      callerUserId === driverUser.id ? 'DRIVER' : 'RIDER';
    const recipient =
      callerType === 'DRIVER' ? consumerUser : driverUser;

    // Unique channel name per call attempt — short, URL-safe.
    const channelName = `r_${rideId.replace(/-/g, '').slice(0, 12)}_${randomBytes(3).toString('hex')}`;

    const callerUid = this.uidForUser(callerUserId);
    const recipientUid = this.uidForUser(recipient.id);
    const callerToken = this.issueToken(channelName, callerUid);
    const recipientToken = this.issueToken(channelName, recipientUid);

    const call = await this.prisma.call.create({
      data: {
        callerId: callerUserId,
        callerType: callerType as any,
        receiverId: recipient.id,
        receiverType: (callerType === 'DRIVER' ? 'RIDER' : 'DRIVER') as any,
        rideId,
        callType: callType as any,
        callMethod: 'AGORA',
        agoraChannel: channelName,
        status: 'INITIATED',
      },
    });

    await this.prisma.callLog.create({
      data: {
        callId: call.id,
        event: 'INITIATED',
        metadata: { callerType, callType },
      },
    });

    // Push to the recipient.
    const incomingPayload = {
      callId: call.id,
      rideId,
      channelName,
      token: recipientToken,
      uid: recipientUid,
      callerName:
        callerType === 'DRIVER'
          ? `${driverUser.firstName ?? ''} ${driverUser.lastName ?? ''}`.trim()
          : `${consumerUser.firstName ?? ''} ${consumerUser.lastName ?? ''}`.trim(),
      callerType,
      callType,
      appId: this.appId,
    };

    if (callerType === 'DRIVER') {
      // Recipient is the rider — push via consumer gateway.
      this.consumerGateway.emitToUser(
        consumerUser.id,
        'call:incoming',
        incomingPayload,
      );
    } else {
      // Recipient is the driver — push via driver gateway.
      try {
        const driver = await this.prisma.driver.findUnique({
          where: { userId: driverUser.id },
          select: { id: true },
        });
        if (driver) {
          this.driverGateway.server
            .to(driver.id)
            .emit('call:incoming', incomingPayload);
        }
      } catch {/* swallow */}
    }

    // Mark RINGING after notifying.
    await this.prisma.call.update({
      where: { id: call.id },
      data: { status: 'RINGING', startedAt: new Date() },
    });

    return {
      callId: call.id,
      channelName,
      token: callerToken,
      uid: callerUid,
      appId: this.appId,
    };
  }

  /// Recipient accepts. Updates the call to ANSWERED and broadcasts.
  async acceptCall(callId: string, userId: string) {
    const call = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundException('Call not found');
    if (call.receiverId !== userId) {
      throw new ForbiddenException('You are not the recipient');
    }
    const updated = await this.prisma.call.update({
      where: { id: callId },
      data: { status: 'ANSWERED', answeredAt: new Date() },
    });
    await this.prisma.callLog.create({
      data: { callId, event: 'ANSWERED' },
    });
    this.broadcastCallEvent(updated, 'call:accepted');
    return updated;
  }

  async rejectCall(callId: string, userId: string, reason?: string) {
    const call = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundException('Call not found');
    if (call.receiverId !== userId && call.callerId !== userId) {
      throw new ForbiddenException('Not your call');
    }
    const updated = await this.prisma.call.update({
      where: { id: callId },
      data: {
        status: 'REJECTED',
        endedAt: new Date(),
        failureReason: reason ?? null,
      },
    });
    await this.prisma.callLog.create({
      data: { callId, event: 'REJECTED', metadata: { reason } },
    });
    this.broadcastCallEvent(updated, 'call:ended');
    return updated;
  }

  async endCall(callId: string, userId: string) {
    const call = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundException('Call not found');
    if (call.receiverId !== userId && call.callerId !== userId) {
      throw new ForbiddenException('Not your call');
    }
    const endedAt = new Date();
    const startedAt = call.answeredAt ?? call.startedAt ?? endedAt;
    const durationSeconds = Math.max(
      0,
      Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
    );
    const updated = await this.prisma.call.update({
      where: { id: callId },
      data: {
        status: 'ENDED',
        endedAt,
        durationSeconds,
      },
    });
    await this.prisma.callLog.create({
      data: { callId, event: 'ENDED', metadata: { durationSeconds } },
    });
    this.broadcastCallEvent(updated, 'call:ended');
    return updated;
  }

  /// Lookup history for the caller — used by a future call-log screen.
  async getMyCalls(userId: string) {
    return this.prisma.call.findMany({
      where: {
        OR: [{ callerId: userId }, { receiverId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  private async broadcastCallEvent(call: any, event: string) {
    const payload = {
      callId: call.id,
      rideId: call.rideId,
      status: call.status,
    };
    // Notify both ends — they'll filter by callId on the client.
    this.consumerGateway.emitToUser(call.callerId, event, payload);
    this.consumerGateway.emitToUser(call.receiverId, event, payload);

    // Also push to driver if either party is a driver — the driver
    // gateway is keyed by driverId, so we need a lookup.
    try {
      const driverIds = await this.prisma.driver.findMany({
        where: { userId: { in: [call.callerId, call.receiverId] } },
        select: { id: true },
      });
      for (const d of driverIds) {
        this.driverGateway.server.to(d.id).emit(event, payload);
      }
    } catch {/* swallow */}
  }
}
