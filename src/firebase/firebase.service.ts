import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app!: admin.app.App;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    let privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY') || '';
    // Strip wrapping quotes if present (some hosting UIs add them)
    privateKey = privateKey.replace(/^["']|["']$/g, '');
    // Convert literal \n sequences to real newlines
    privateKey = privateKey.replace(/\\n/g, '\n');

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
      const isRideOffer = data?.type === 'RIDE_OFFER';

      // For ride offers we send a DATA-ONLY message so the Flutter app gets
      // full control on every platform (cold-start, background, foreground)
      // and can play the custom alarm sound + force the activity to the
      // foreground. For everything else we use a regular notification message
      // so it's still visible while the app is killed.
      const message: admin.messaging.Message = isRideOffer
        ? {
            token,
            data: {
              ...(data ?? {}),
              title,
              body,
              click_action: 'FLUTTER_NOTIFICATION_CLICK',
            },
            android: {
              priority: 'high',
              ttl: 60_000, // 1 minute — match the ride-offer expiry
            },
            apns: {
              headers: {
                'apns-priority': '10',
                'apns-push-type': 'alert',
              },
              payload: {
                aps: {
                  contentAvailable: true,
                  mutableContent: true,
                  sound: 'ride_offer.wav',
                  category: 'RIDE_OFFER',
                },
              },
            },
          }
        : {
            token,
            notification: { title, body },
            data,
            android: {
              priority: 'high',
              notification: {
                channelId: 'masar_driver_channel_v2',
                priority: 'high',
                sound: 'masar_notification',
                defaultVibrateTimings: true,
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: 'masar_notification.mp3',
                  badge: 1,
                },
              },
            },
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
