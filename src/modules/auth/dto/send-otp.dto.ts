import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+222\d{8}$/, {
    message: 'Phone number must be in format +222XXXXXXXX (Mauritanian format)',
  })
  phoneNumber!: string;
}
