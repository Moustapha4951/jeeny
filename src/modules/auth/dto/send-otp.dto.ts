import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+\d{10,15}$/, {
    message: 'Phone number must be in international format (e.g., +222XXXXXXXX)',
  })
  phoneNumber!: string;
}
