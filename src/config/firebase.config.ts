import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Global()
@Module({})
export class FirebaseModule {
  static forRoot(): DynamicModule {
    return {
      module: FirebaseModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: 'FIREBASE_ADMIN',
          useFactory: (configService: ConfigService) => {
            const serviceAccount = {
              projectId: configService.get<string>('FIREBASE_PROJECT_ID'),
              clientEmail: configService.get<string>('FIREBASE_CLIENT_EMAIL'),
              privateKey: configService.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
            };

            if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
              throw new Error('Firebase service account credentials not configured');
            }

            if (!admin.apps.length) {
              admin.initializeApp({
                credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
              });
            }

            return admin;
          },
          inject: [ConfigService],
        },
      ],
      exports: ['FIREBASE_ADMIN'],
    };
  }
}
