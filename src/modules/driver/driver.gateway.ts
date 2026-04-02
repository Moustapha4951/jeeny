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

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/driver',
})
export class DriverGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private driverSockets = new Map<string, string>(); // driverId -> socketId

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        console.log('WebSocket connection rejected: No token provided');
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const driverId = payload.sub;

      // Store driver socket mapping
      this.driverSockets.set(driverId, client.id);
      client.data.driverId = driverId;

      console.log(`✅ Driver ${driverId} connected via WebSocket`);

      // Send initial data
      await this.sendDriverUpdate(driverId);
    } catch (error) {
      console.error('WebSocket connection error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const driverId = client.data.driverId;
    if (driverId) {
      this.driverSockets.delete(driverId);
      console.log(`Driver ${driverId} disconnected from WebSocket`);
    }
  }

  @SubscribeMessage('location:update')
  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { latitude: number; longitude: number },
  ) {
    const driverId = client.data.driverId;
    if (!driverId) return;

    try {
      await this.prisma.driver.update({
        where: { id: driverId },
        data: {
          currentLat: data.latitude,
          currentLng: data.longitude,
          lastLocationAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Location update error:', error);
    }
  }

  // Send driver profile update to specific driver
  async sendDriverUpdate(driverId: string) {
    const socketId = this.driverSockets.get(driverId);
    if (!socketId) return;

    try {
      const driver = await this.prisma.driver.findUnique({
        where: { id: driverId },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
          vehicles: true,
        },
      });

      if (driver) {
        // Get wallet separately
        const wallet = await this.prisma.wallet.findUnique({
          where: { userId: driver.userId },
        });

        this.server.to(socketId).emit('driver:update', {
          id: driver.id,
          firstName: driver.user.firstName,
          lastName: driver.user.lastName,
          phone: driver.user.phone,
          isOnline: driver.isOnline,
          rating: driver.rating,
          totalRides: driver.totalTrips,
          wallet: {
            balance: wallet?.balance || 0,
          },
          vehicle: driver.vehicles?.[0] || null,
        });
      }
    } catch (error) {
      console.error('Error sending driver update:', error);
    }
  }

  // Send wallet update to specific driver
  async sendWalletUpdate(driverId: string) {
    const socketId = this.driverSockets.get(driverId);
    if (!socketId) return;

    try {
      const wallet = await this.prisma.wallet.findUnique({
        where: { userId: driverId },
      });

      if (wallet) {
        this.server.to(socketId).emit('wallet:update', {
          balance: wallet.balance,
        });
      }
    } catch (error) {
      console.error('Error sending wallet update:', error);
    }
  }

  // Send ride request to specific driver
  async sendRideRequest(driverId: string, ride: any) {
    const socketId = this.driverSockets.get(driverId);
    if (!socketId) return;

    this.server.to(socketId).emit('ride:new', ride);
  }

  // Send ride update to specific driver
  async sendRideUpdate(driverId: string, ride: any) {
    const socketId = this.driverSockets.get(driverId);
    if (!socketId) return;

    this.server.to(socketId).emit('ride:update', ride);
  }

  // Broadcast to all online drivers
  broadcastToOnlineDrivers(event: string, data: any) {
    this.server.emit(event, data);
  }
}
