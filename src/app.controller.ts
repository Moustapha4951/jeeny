import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prismaService: PrismaService) {}

  @Get('health')
  async healthCheck() {
    let databaseStatus = 'disconnected';

    try {
      // Test database connection
      await this.prismaService.$queryRaw`SELECT 1`;
      databaseStatus = 'connected';
    } catch (err) {
      databaseStatus = 'error';
    }

    return {
      status: databaseStatus === 'connected' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      database: databaseStatus,
    };
  }

  @Get()
  root() {
    return {
      name: 'Jeeny Backend API',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        health: '/health',
        api: '/api/v1',
        websocket: '/ws',
      },
    };
  }
}
