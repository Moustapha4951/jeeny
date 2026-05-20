import { Controller, Get, Post, Body, Render, HttpCode, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('delete-account')
export class DeleteAccountController {
  constructor(private prisma: PrismaService) {}

  // Public page explaining account deletion
  @Get()
  @Render('delete-account')
  getDeleteAccountPage() {
    return {
      title: 'حذف الحساب - Delete Account',
      message: 'يمكنك حذف حسابك من خلال التطبيق أو عبر هذه الصفحة',
    };
  }

  // Public endpoint for account deletion request
  @Post('request')
  @HttpCode(HttpStatus.OK)
  async requestAccountDeletion(@Body() body: { phoneNumber: string; reason?: string }) {
    const { phoneNumber, reason } = body;

    if (!phoneNumber) {
      return {
        success: false,
        message: 'رقم الهاتف مطلوب / Phone number is required',
      };
    }

    // Find user by phone
    const user = await this.prisma.user.findUnique({
      where: { phone: phoneNumber },
    });

    if (!user) {
      return {
        success: false,
        message: 'الحساب غير موجود / Account not found',
      };
    }

    // Create deletion request
    await this.prisma.accountDeletionRequest.create({
      data: {
        userId: user.id,
        phoneNumber: phoneNumber,
        reason: reason || 'User requested deletion',
        status: 'PENDING',
      },
    });

    return {
      success: true,
      message: 'تم استلام طلب حذف الحساب. سيتم حذف حسابك خلال 30 يوماً / Account deletion request received. Your account will be deleted within 30 days.',
    };
  }

  // Public endpoint to check deletion status
  @Post('status')
  @HttpCode(HttpStatus.OK)
  async checkDeletionStatus(@Body() body: { phoneNumber: string }) {
    const { phoneNumber } = body;

    if (!phoneNumber) {
      return {
        success: false,
        message: 'رقم الهاتف مطلوب / Phone number is required',
      };
    }

    const deletionRequest = await this.prisma.accountDeletionRequest.findFirst({
      where: { phoneNumber },
      orderBy: { createdAt: 'desc' },
    });

    if (!deletionRequest) {
      return {
        success: false,
        message: 'لا يوجد طلب حذف لهذا الحساب / No deletion request found',
      };
    }

    return {
      success: true,
      status: deletionRequest.status,
      requestedAt: deletionRequest.createdAt,
      message: deletionRequest.status === 'PENDING' 
        ? 'طلبك قيد المعالجة / Your request is being processed'
        : deletionRequest.status === 'COMPLETED'
        ? 'تم حذف حسابك / Your account has been deleted'
        : 'تم إلغاء الطلب / Request was cancelled',
    };
  }
}
