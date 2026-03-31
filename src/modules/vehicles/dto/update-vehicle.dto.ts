import { IsString, IsOptional, IsNumber } from 'class-validator';

export class UpdateVehicleDto {
  @IsString()
  @IsOptional()
  make?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsNumber()
  @IsOptional()
  year?: number;

  @IsString()
  @IsOptional()
  color?: string;

  @IsString()
  @IsOptional()
  licensePlate?: string;

  @IsString()
  @IsOptional()
  registrationUrl?: string;

  @IsString()
  @IsOptional()
  insuranceUrl?: string;
}
