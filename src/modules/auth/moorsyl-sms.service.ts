import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class MoorsylSmsService {
  private readonly logger = new Logger(MoorsylSmsService.name);
  private readonly baseUrl = 'https://api.moorsyl.com/api/sms';
  private readonly apiKey = process.env.MOORSYL_API_KEY || '';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Ensure phone has the correct country code formatting if Moorsyl requires it.
   * Based on the cURL example, it expects "+22236551999" format.
   */
  private formatPhone(phone: string): string {
    let p = phone.trim().replace(/\s+/g, '');
    // If it doesn't start with +, assume it's a local number and prepend +222
    if (!p.startsWith('+')) {
      if (p.startsWith('00222')) {
        p = '+' + p.slice(2);
      } else if (p.startsWith('222') && p.length > 8) {
        p = '+' + p;
      } else {
        p = '+222' + p;
      }
    }
    return p;
  }

  async sendOTP(phoneNumber: string, otp: string): Promise<any> {
    const phone = this.formatPhone(phoneNumber);
    const body = `Your Masar verification code is: ${otp}`;
    
    try {
      this.logger.log(`Sending SMS via Moorsyl to ${phone}`);
      const response = await firstValueFrom(
        this.httpService.post(
          this.baseUrl,
          {
            to: phone,
            from: 'moorsyl',
            body: body,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': this.apiKey,
            },
          },
        ),
      );
      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorMsg = errorData ? JSON.stringify(errorData) : error.message;
      
      this.logger.error(`Failed to send SMS via Moorsyl: ${errorMsg}`);
      
      throw new Error(
        `Failed to send SMS: ${
          errorData?.message || error.message
        }`,
      );
    }
  }
}
