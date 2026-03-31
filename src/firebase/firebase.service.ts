import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app: admin.app.App;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.error('Firebase credentials are missing in environment variables');
      throw new Error('Firebase credentials are required');
    }

    this.app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });

    this.logger.log('Firebase Admin SDK initialized successfully');
  }

  getApp(): admin.app.App {
    return this.app;
  }

  getMessaging(): admin.messaging.Messaging {
    return this.app.messaging();
  }

  getAuth(): admin.auth.Auth {
    return this.app.auth();
  }

  async sendNotification(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<string> {
    try {
      const message: admin.messaging.Message = {
        token,
        notification: {
          title,
          body,
        },
        data,
      };

      const response = await this.getMessaging().send(message);
      this.logger.log(`Notification sent successfully: ${response}`);
      return response;
    } catch (error) {
      this.logger.error('Error sending notification:', error);
      throw error;
    }
  }

  async sendMulticast(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<admin.messaging.BatchResponse> {
    try {
      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title,
          body,
        },
        data,
      };

      const response = await this.getMessaging().sendEachForMulticast(message);
      this.logger.log(`Multicast sent: ${response.successCount} success, ${response.failureCount} failed`);
      return response;
    } catch (error) {
      this.logger.error('Error sending multicast:', error);
      throw error;
    }
  }

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    try {
      return await this.getAuth().verifyIdToken(idToken);
    } catch (error) {
      this.logger.error('Error verifying ID token:', error);
      throw error;
    }
  }
}
