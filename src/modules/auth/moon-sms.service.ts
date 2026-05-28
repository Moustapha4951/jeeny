import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface MoonSendResponse {
  status?: string;
  id?: string | number;
  // Moon returns a free-form payload; keep the rest typed loosely.
  [key: string]: unknown;
}

interface MoonStatisticsResponse {
  [key: string]: unknown;
}

@Injectable()
export class MoonSmsService {
  private readonly logger = new Logger(MoonSmsService.name);
  private readonly baseUrl =
    process.env.MOON_SMS_BASE_URL || 'http://sms.moon.mr:8008';
  private readonly auth =
    process.env.MOON_SMS_AUTH ||
    'Basic Y29tcHRlLm1hc2FyQG1vb24ubXI6MjAjbW9vbl9tYXNhciMyNg==';
  // Moon required this prefix during their acceptance testing window.
  // Set MOON_SMS_TESTING=false in env once they confirm production.
  private readonly testing = process.env.MOON_SMS_TESTING !== 'false';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Strip Mauritanian country code from a phone number. Moon expects
   * an 8-digit local number (e.g. 33445566) — incoming requests use
   * E.164 (+22233445566).
   */
  private normalizePhone(phone: string): string {
    let p = phone.trim().replace(/\s+/g, '');
    if (p.startsWith('+')) p = p.slice(1);
    if (p.startsWith('00222')) p = p.slice(5);
    if (p.startsWith('222') && p.length > 8) p = p.slice(3);
    return p;
  }

  async sendSMS(phoneNumber: string, message: string): Promise<MoonSendResponse> {
    const phone = this.normalizePhone(phoneNumber);
    const body = this.testing
      ? `Message de test - ${message}`
      : message;
    try {
      this.logger.log(`Sending SMS via Moon to ${phone}`);
      const response = await firstValueFrom(
        this.httpService.post<MoonSendResponse>(
          `${this.baseUrl}/api/sendsms`,
          { phone, message: body },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: this.auth,
            },
          },
        ),
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(
        'Failed to send SMS via Moon:',
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to send SMS: ${
          error.response?.data?.message || error.message
        }`,
      );
    }
  }

  async getStatistics(): Promise<MoonStatisticsResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<MoonStatisticsResponse>(
          `${this.baseUrl}/api/sms-statistics`,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: this.auth,
            },
          },
        ),
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(
        'Failed to fetch SMS statistics:',
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to fetch SMS statistics: ${
          error.response?.data?.message || error.message
        }`,
      );
    }
  }

  async sendOTP(phoneNumber: string, otp: string): Promise<string> {
    // Bilingual OTP message — Arabic first for Mauritanian users, French
    // fallback line second. Moon's testing window also requires the
    // message to include a recognisable verification phrase.
    const message =
      `رمز التحقق الخاص بك في مسار: ${otp}\n` +
      `Votre code de vérification Masar: ${otp}\n` +
      `صالح لمدة 5 دقائق.`;
    const response = await this.sendSMS(phoneNumber, message);
    return response.id?.toString() ?? '';
  }
}
