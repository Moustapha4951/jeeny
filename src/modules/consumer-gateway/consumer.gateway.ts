import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Realtime gateway for consumer (rider) clients. Mirrors DriverGateway
 * but for the rider side — pushes ride status flips and driver location
 * pings so the consumer app doesn't have to poll.
 *
 * Wire format (events emitted to consumer):
 *   - `ride:update` — full ride payload after any status change
 *   - `driver:location` — { rideId, lat, lng, heading } as the driver moves
 *
 * Authentication: same JWT used for HTTP. Token comes via socket
 * handshake.auth.token; the userId from the JWT is what we use to room
 * the socket so backend services can target this rider directly.
 */
@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/consumer',
})
export class ConsumerGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  // userId -> socketId. We re-key on every connect so reconnects from
  // the same user replace the stale socket.
  private userSockets = new Map<string, string>();

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = payload.userId;
      if (!userId) {
        client.disconnect();
        return;
      }

      // We accept any authenticated user — riders, admins, even drivers
      // (drivers also use the consumer screens occasionally). The room is
      // keyed by userId so emits are unambiguous.
      this.userSockets.set(userId, client.id);
      client.data.userId = userId;
      client.join(`user:${userId}`);

      console.log(`✅ Consumer ${userId} connected via WebSocket`);
    } catch (error) {
      console.error('Consumer WS connection error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (userId && this.userSockets.get(userId) === client.id) {
      this.userSockets.delete(userId);
    }
  }

  /// Subscribe to a specific ride's updates. Lets the client opt into a
  /// per-ride room which we can target from services (saves us a lookup
  /// to find the rider's user id from the rideId).
  @SubscribeMessage('ride:subscribe')
  async handleRideSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { rideId: string },
  ) {
    if (!data?.rideId) return;
    client.join(`ride:${data.rideId}`);
  }

  @SubscribeMessage('ride:unsubscribe')
  async handleRideUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { rideId: string },
  ) {
    if (!data?.rideId) return;
    client.leave(`ride:${data.rideId}`);
  }

  /// Push a ride status update to anyone subscribed to this ride.
  /// Called from RidesService / DriverService whenever a status flips.
  emitRideUpdate(rideId: string, ride: any) {
    this.server.to(`ride:${rideId}`).emit('ride:update', ride);
  }

  /// Push a live driver location ping to anyone subscribed to this ride.
  /// Called from the driver location update endpoint.
  emitDriverLocation(
    rideId: string,
    payload: { lat: number; lng: number; heading?: number | null },
  ) {
    this.server.to(`ride:${rideId}`).emit('driver:location', {
      rideId,
      ...payload,
      ts: Date.now(),
    });
  }

  /// Generic per-user push for things like "your saved place was added"
  /// notifications later. Not used yet for the ride flow but exposed
  /// for future features.
  emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
