import { UserInfo } from 'firebase-admin';

declare global {
  namespace Express {
    export interface Request {
      user?: {
        uid: string;
        phone?: string;
        email?: string;
        type: 'ADMIN' | 'EMPLOYEE';
        adminId?: string;
        employeeId?: string;
        role: string;
      };
    }
  }
}
