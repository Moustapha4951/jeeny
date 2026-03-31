import { IsString, IsOptional, IsEmail, IsDateString, IsIn } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @IsString()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  @IsOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  profilePicture?: string;
}
