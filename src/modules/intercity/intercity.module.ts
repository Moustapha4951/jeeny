import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { IntercityController } from './intercity.controller';
import { IntercityService } from './intercity.service';

@Module({
  imports: [PrismaModule],
  controllers: [IntercityController],
  providers: [IntercityService],
})
export class IntercityModule {}
