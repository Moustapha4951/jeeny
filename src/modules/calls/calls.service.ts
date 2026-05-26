import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { CallStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FirebaseService } from '../../firebase/firebase.service';

/**
 * Voice / video calls between Masar users via Agora RTC.
 *
 * Flow:
 *   1. Caller hits POST /calls/start with the receiverId. We mint an
 *      Agora RTC token for both parties and store a Call row.
 *   2. Push notification with type=INCOMING_CALL is sent to the receiver
 *      so the app can ring (full-screen-intent on Android).
 *   3. The receiver app calls GET /calls/:id/token to fetch its own token,
 *      then both sides join the same channel and the call connects.
 *   4. Either side hits POST /calls/:id/{answer|reject|end} to advance.
 *
 * The Agora SDK handles audio plumbing entirely client-side.
 */
@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly firebase: FirebaseService,
  ) {}

  // Default token TTL — generous for voice calls that may sit ringing
  private readonly _tokenTtlSeconds = 3600; // 1 hour

  private get _appId(): string {
    return this.config.get<string>('AGORA_APP_ID') ?? '';
  }

  private get _appCert(): string {
    return this.config.get<string>('AGORA_APP_CERTIFICATE') ?? '';
  }

  private buildToken(channel: string, uid: number): string {
    if (!this._appId || !this._appCert) {
      throw new BadRequestException(
        'Agora is not configured on the server',
      );
    }
    const expireAt = Math.floor(Date.now() / 1000) + this._tokenTtlSeconds;
    return RtcTokenBuilder.buildTokenWithUid(
      this._appId,
      this._appCert,
      channel,
      uid,
      RtcRole.PUBLISHER,
      expireAt,
      expireAt,
    );
  }

  /** Stable numeric uid derived from a UUID. Agora needs a uint32. */
  private uidFor(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = (hash * 31 + userId.charCodeAt(i)) | 0;
    }
    // Force unsigned 32-bit int
    return Math.abs(hash) % 2147483647;
  }

  /**
   * Caller starts a call. Returns the Call id, channel name, and the
   * caller's Agora token. Sends an INCOMING_CALL push to the receiver.
   */
  async start(callerId: string, receiverId: string) {
    if (callerId === receiverId) {
      throw new BadRequestException('You cannot call yourself');
    }
    const [caller, receiver] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: callerId },
        select: { id: true, firstName: true, lastName: true, phone: true },
      }),
      this.prisma.user.findUnique({
        where: { id: receiverId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          fcmToken: true,
        },
      }),
    ]);
    if (!caller || !receiver) {
      throw new NotFoundException('User not found');
    }

    const channel = `masar_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const callerToken = this.buildToken(channel, this.uidFor(callerId));

    const call = await this.prisma.call.create({
      data: {
        callerId,
        callerType: 'SUPPORT', // generic; we route between any two users
        receiverId,
        receiverType: 'SUPPORT',
        callType: 'VOICE',
        callMethod: 'AGORA',
        agoraChannel: channel,
        status: 'INITIATED',
      },
    });

    // Ring the receiver
    if (receiver.fcmToken) {
      try {
        await this.firebase.sendNotification(
          receiver.fcmToken,
          'مكالمة واردة',
          `${caller.firstName ?? ''} ${caller.lastName ?? ''}`.trim() ||
            'متصل',
          {
            type: 'INCOMING_CALL',
            callId: call.id,
            channel,
            callerId,
            callerName:
              `${caller.firstName ?? ''} ${caller.lastName ?? ''}`.trim(),
            callerPhone: caller.phone ?? '',
          },
        );
      } catch (e) {
        this.logger.error('Failed to ring receiver', e as Error);
      }
    }

    return {
      callId: call.id,
      channel,
      token: callerToken,
      uid: this.uidFor(callerId),
      appId: this._appId,
      receiver: {
        id: receiver.id,
        firstName: receiver.firstName,
        lastName: receiver.lastName,
        phone: receiver.phone,
      },
    };
  }

  /** Returns a token for whichever side is asking (must be a participant). */
  async getToken(userId: string, callId: string) {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
    });
    if (!call) throw new NotFoundException('Call not found');
    if (call.callerId !== userId && call.receiverId !== userId) {
      throw new ForbiddenException('Not a participant');
    }
    if (!call.agoraChannel) {
      throw new BadRequestException('Call has no channel');
    }
    return {
      callId: call.id,
      channel: call.agoraChannel,
      token: this.buildToken(call.agoraChannel, this.uidFor(userId)),
      uid: this.uidFor(userId),
      appId: this._appId,
    };
  }

  async advance(
    userId: string,
    callId: string,
    next: CallStatus,
  ) {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
    });
    if (!call) throw new NotFoundException('Call not found');
    if (call.callerId !== userId && call.receiverId !== userId) {
      throw new ForbiddenException('Not a participant');
    }

    const data: Record<string, unknown> = { status: next };
    const now = new Date();
    if (next === 'ANSWERED' && !call.answeredAt) {
      data.answeredAt = now;
      data.startedAt = now;
    }
    if (next === 'ENDED' || next === 'REJECTED' || next === 'MISSED') {
      data.endedAt = now;
      if (call.startedAt) {
        const seconds = Math.max(
          0,
          Math.round((now.getTime() - call.startedAt.getTime()) / 1000),
        );
        data.durationSeconds = seconds;
      }
    }

    const updated = await this.prisma.call.update({
      where: { id: callId },
      data,
    });

    // Notify the other side so its UI can react (call answered / ended)
    const otherId =
      call.callerId === userId ? call.receiverId : call.callerId;
    try {
      const other = await this.prisma.user.findUnique({
        where: { id: otherId },
        select: { fcmToken: true },
      });
      if (other?.fcmToken) {
        await this.firebase.sendNotification(
          other.fcmToken,
          next === 'ANSWERED'
            ? 'تم الرد'
            : next === 'REJECTED'
              ? 'تم الرفض'
              : 'انتهت المكالمة',
          '',
          {
            type: 'CALL_STATUS',
            callId,
            status: next,
          },
        );
      }
    } catch (_) {
      // ignore
    }

    return updated;
  }
}
