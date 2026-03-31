import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Request } from 'express';
import * as admin from 'firebase-admin';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject('FIREBASE_ADMIN') private readonly firebaseAdmin: admin.app.App,
    private readonly prismaService: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token provided');
    }

    const token = authHeader.split(' ')[1];

    try {
      const decodedToken = await this.firebaseAdmin.auth().verifyIdToken(token);
      const uid = decodedToken.uid;

      // Check if user is pre-registered as Admin or Employee
      const [adminRecord, employeeRecord] = await Promise.all([
        this.prismaService.admin.findUnique({
          where: { userId: uid },
          select: { id: true, role: true, userId: true },
        }),
        this.prismaService.employee.findUnique({
          where: { userId: uid },
          select: { id: true, role: true, userId: true, employeeId: true },
        }),
      ]);

      if (!adminRecord && !employeeRecord) {
        throw new ForbiddenException('User not pre-registered as admin or employee');
      }

      // Attach user info to request
      request.user = {
        uid,
        phone: decodedToken.phone,
        email: decodedToken.email,
        type: adminRecord ? 'ADMIN' : 'EMPLOYEE',
        adminId: adminRecord?.id,
        employeeId: employeeRecord?.id,
        role: adminRecord?.role || employeeRecord?.role,
      };

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
