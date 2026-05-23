import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface MoorsylSendResponse {
  id: string;
  to: string;
  from: string;
  body: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  created_at: string;
}

interface MoorsylStatusResponse {
  id: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  delivered_at?: string;
  error?: string;
}

@Injectable()
export class MoorsylService {
  private readonly logger = new Logger(MoorsylService.name);
  private readonly apiKey = process.env.MOORSYL_API_KEY || 'pk_fukwCPnBNyIWtUHBYGAHAyGVVDDnwpSkuXDILFbaMnRGbncXtmwxUNYqfzvbyxkh';
  private readonly baseUrl = 'https://api.moorsyl.com/api';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Send SMS via Moorsyl API
   * Works with all Mauritanian carriers: Mauritel, Mattel, Chinguitel
   */
  async sendSMS(phoneNumber: string, message: string): Promise<MoorsylSendResponse> {
    try {
      this.logger.log(`Sending SMS to ${phoneNumber} via Moorsyl`);

      const response = await firstValueFrom(
        this.httpService.post<MoorsylSendResponse>(
          `${this.baseUrl}/sms`,
          {
            to: phoneNumber,
            body: message,
          },
          {
            headers: {
              'x-api-key': this.apiKey,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.logger.log(`SMS sent successfully. Message ID: ${response.data.id}`);
      return response.data;
    } catch (error: any) {
      this.logger.error('Failed to send SMS via Moorsyl:', error.response?.data || error.message);
      throw new Error(`Failed to send SMS: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Check SMS delivery status
   */
  async getStatus(messageId: string): Promise<MoorsylStatusResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<MoorsylStatusResponse>(
          `${this.baseUrl}/sms/${messageId}`,
          {
            headers: {
              'x-api-key': this.apiKey,
            },
          },
        ),
      );

      return response.data;
    } catch (error: any) {
      this.logger.error('Failed to get SMS status:', error.response?.data || error.message);
      throw new Error(`Failed to get SMS status: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Send OTP SMS with proper formatting
   */
  async sendOTP(phoneNumber: string, otp: string): Promise<string> {
    const message = `رمز التحقق الخاص بك في مسار هو: ${otp}\n\nYour Masar verification code is: ${otp}\n\nValid for 5 minutes.`;
    
    const response = await this.sendSMS(phoneNumber, message);
    return response.id; // Return message ID for tracking
  }
}
