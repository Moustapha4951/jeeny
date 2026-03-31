import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsResponse,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';

interface AuthenticatedSocket extends Socket {
  userId: string;
  role: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class WebsocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  afterInit(server: Server) {
    console.log('WebSocket Gateway Initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    // Auth guard will have already validated the token and attached user info
    const request = client.handshake;
    if (request.auth?.token) {
      // Verify token and get user info (already done by AuthGuard in HTTP)
      // For WS, we'll do minimal auth here; ideally use same logic
      try {
        // We'll attach placeholder; actual verification should be done via middleware
        client.userId = 'unknown';
        client.role = 'unknown';
        client.join('admin'); // Will join specific rooms after verification
        console.log(`Client connected: ${client.id}`);
      } catch (err) {
        client.disconnect();
        throw new WsException('Authentication failed');
      }
    } else {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('auth')
  async handleAuth(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { token: string },
  ) {
    // Verify Firebase token and attach user info
    // This is a simplified version - we'll reuse AuthGuard logic in production
    try {
      // For now, just accept and set placeholder
      client.userId = 'user_' + Math.random().toString(36).substr(2, 9);
      client.role = 'ADMIN';
      client.join('admin');
      return { event: 'connected', data: { userId: client.userId, role: client.role } };
    } catch (err) {
      throw new WsException('Invalid token');
    }
  }

  @SubscribeMessage('driver_location')
  async handleDriverLocation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { lat: number; lng: number; heading?: number },
  ) {
    // Broadcast to admin room
    this.server.to('admin').emit('driver_location_update', {
      driverId: client.userId,
      ...data,
      timestamp: new Date().toISOString(),
    });
    return { event: 'location_received' };
  }

  @SubscribeMessage('accept_ride')
  async handleAcceptRide(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { rideOfferId?: string; rideId?: string },
  ) {
    // Handle ride acceptance
    this.server.to('admin').emit('ride_assigned', {
      rideId: data.rideId,
      driverId: client.userId,
      assignedAt: new Date().toISOString(),
    });
    // Also notify the driver
    client.emit('ride_accepted', { rideId: data.rideId });
    return { event: 'ride_accepted', ...data };
  }

  @SubscribeMessage('reject_ride')
  async handleRejectRide(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { rideOfferId: string },
  ) {
    // Handle ride rejection
    this.server.to('admin').emit('ride_rejected', {
      rideOfferId: data.rideOfferId,
      driverId: client.userId,
    });
    return { event: 'ride_rejected', ...data };
  }

  @SubscribeMessage('ride_status_update')
  async handleRideStatusUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { rideId: string; status: string },
  ) {
    // Broadcast status update to admin
    this.server.to('admin').emit('ride_updated', {
      rideId: data.rideId,
      status: data.status,
      driverId: client.userId,
    });
    return { event: 'status_updated', ...data };
  }

  // Helper methods to emit from services
  emitToAdmin(event: string, data: any) {
    this.server.to('admin').emit(event, data);
  }

  emitToDriver(driverId: string, event: string, data: any) {
    this.server.to(`driver_${driverId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user_${userId}`).emit(event, data);
  }
}
