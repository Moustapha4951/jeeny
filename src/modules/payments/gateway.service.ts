import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';

export interface PaymentGatewayResponse {
  success: boolean;
  transactionId?: string;
  paymentUrl?: string;
  error?: string;
}

@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  async initiatePayment(
    gateway: 'BANKILY' | 'SEDAD' | 'MASRVI',
    amount: number,
    userId: string,
    referenceId: string,
  ): Promise<PaymentGatewayResponse> {
    switch (gateway) {
      case 'BANKILY':
        return this.initiateBankilyPayment(amount, userId, referenceId);
      case 'SEDAD':
        return this.initiateSedadPayment(amount, userId, referenceId);
      case 'MASRVI':
        return this.initiateMasrviPayment(amount, userId, referenceId);
      default:
        throw new BadRequestException('Invalid payment gateway');
    }
  }

  private async initiateBankilyPayment(
    amount: number,
    userId: string,
    referenceId: string,
  ): Promise<PaymentGatewayResponse> {
    try {
      const apiKey = this.configService.get<string>('BANKILY_API_KEY');
      const apiUrl = this.configService.get<string>('BANKILY_API_URL');

      if (!apiKey || !apiUrl) {
        throw new Error('Bankily configuration missing');
      }

      // Get user phone number
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Bankily API integration
      const response = await axios.post(
        `${apiUrl}/payment/initiate`,
        {
          amount,
          currency: 'MRU',
          phoneNumber: user.phone,
          reference: referenceId,
          callbackUrl: `${this.configService.get('APP_URL')}/webhooks/bankily`,
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`Bankily payment initiated: ${response.data.transactionId}`);

      return {
        success: true,
        transactionId: response.data.transactionId,
        paymentUrl: response.data.paymentUrl,
      };
    } catch (error) {
      this.logger.error('Bankily payment initiation failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async initiateSedadPayment(
    amount: number,
    userId: string,
    referenceId: string,
  ): Promise<PaymentGatewayResponse> {
    try {
      const apiKey = this.configService.get<string>('SEDAD_API_KEY');
      const apiUrl = this.configService.get<string>('SEDAD_API_URL');

      if (!apiKey || !apiUrl) {
        throw new Error('Sedad configuration missing');
      }

      // Get user phone number
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Sedad API integration
      const response = await axios.post(
        `${apiUrl}/transactions/create`,
        {
          amount,
          currency: 'MRU',
          customerPhone: user.phone,
          merchantReference: referenceId,
          webhookUrl: `${this.configService.get('APP_URL')}/webhooks/sedad`,
        },
        {
          headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`Sedad payment initiated: ${response.data.transactionId}`);

      return {
        success: true,
        transactionId: response.data.transactionId,
        paymentUrl: response.data.checkoutUrl,
      };
    } catch (error) {
      this.logger.error('Sedad payment initiation failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async initiateMasrviPayment(
    amount: number,
    userId: string,
    referenceId: string,
  ): Promise<PaymentGatewayResponse> {
    try {
      const apiKey = this.configService.get<string>('MASRVI_API_KEY');
      const apiUrl = this.configService.get<string>('MASRVI_API_URL');

      if (!apiKey || !apiUrl) {
        throw new Error('Masrvi configuration missing');
      }

      // Get user phone number
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Masrvi API integration
      const response = await axios.post(
        `${apiUrl}/api/payment/init`,
        {
          amount: amount * 100, // Convert to cents
          currency: 'MRU',
          phone: user.phone,
          orderId: referenceId,
          notifyUrl: `${this.configService.get('APP_URL')}/webhooks/masrvi`,
        },
        {
          headers: {
            'Api-Key': apiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`Masrvi payment initiated: ${response.data.paymentId}`);

      return {
        success: true,
        transactionId: response.data.paymentId,
        paymentUrl: response.data.paymentLink,
      };
    } catch (error) {
      this.logger.error('Masrvi payment initiation failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async verifyPayment(
    gateway: 'BANKILY' | 'SEDAD' | 'MASRVI',
    transactionId: string,
  ): Promise<boolean> {
    switch (gateway) {
      case 'BANKILY':
        return this.verifyBankilyPayment(transactionId);
      case 'SEDAD':
        return this.verifySedadPayment(transactionId);
      case 'MASRVI':
        return this.verifyMasrviPayment(transactionId);
      default:
        return false;
    }
  }

  private async verifyBankilyPayment(transactionId: string): Promise<boolean> {
    try {
      const apiKey = this.configService.get<string>('BANKILY_API_KEY');
      const apiUrl = this.configService.get<string>('BANKILY_API_URL');

      const response = await axios.get(
        `${apiUrl}/payment/status/${transactionId}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        },
      );

      return response.data.status === 'SUCCESS';
    } catch (error) {
      this.logger.error('Bankily payment verification failed:', error);
      return false;
    }
  }

  private async verifySedadPayment(transactionId: string): Promise<boolean> {
    try {
      const apiKey = this.configService.get<string>('SEDAD_API_KEY');
      const apiUrl = this.configService.get<string>('SEDAD_API_URL');

      const response = await axios.get(
        `${apiUrl}/transactions/${transactionId}`,
        {
          headers: {
            'X-API-Key': apiKey,
          },
        },
      );

      return response.data.status === 'COMPLETED';
    } catch (error) {
      this.logger.error('Sedad payment verification failed:', error);
      return false;
    }
  }

  private async verifyMasrviPayment(transactionId: string): Promise<boolean> {
    try {
      const apiKey = this.configService.get<string>('MASRVI_API_KEY');
      const apiUrl = this.configService.get<string>('MASRVI_API_URL');

      const response = await axios.get(
        `${apiUrl}/api/payment/status/${transactionId}`,
        {
          headers: {
            'Api-Key': apiKey,
          },
        },
      );

      return response.data.status === 'PAID';
    } catch (error) {
      this.logger.error('Masrvi payment verification failed:', error);
      return false;
    }
  }
}
