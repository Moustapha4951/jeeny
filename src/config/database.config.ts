import { DynamicModule, Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [PrismaService],
      exports: [PrismaService],
    };
  }
}
