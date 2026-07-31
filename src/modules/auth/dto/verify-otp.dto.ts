import { IsString, IsNotEmpty, Matches, Length, IsOptional } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+\d{10,15}$/, {
    message: 'Phone number must be in international format (e.g., +222XXXXXXXX)',
  })
  phoneNumber!: string;

  // Optional: only used for the legacy DB-OTP path (dev/testing). When the
  // client authenticates through Firebase Phone Auth it sends firebaseIdToken
  // instead, and no server-side OTP code is required.
  @IsString()
  @IsOptional()
  @Length(4, 4, { message: 'OTP must be exactly 4 digits' })
  @Matches(/^\d{4}$/, { message: 'OTP must contain only digits' })
  otp?: string;

  @IsString()
  @IsOptional()
  deviceInfo?: string;

  @IsString()
  @IsOptional()
  fcmToken?: string;

  @IsString()
  @IsOptional()
  firebaseIdToken?: string;
}
