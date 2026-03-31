import { IsString, IsNotEmpty, IsNumber, IsOptional, IsDateString, IsIn } from 'class-validator';

export class CreateRideDto {
  @IsString()
  @IsNotEmpty()
  vehicleTypeId: string;

  @IsString()
  @IsNotEmpty()
  pickupAddress: string;

  @IsNumber()
  pickupLatitude: number;

  @IsNumber()
  pickupLongitude: number;

  @IsString()
  @IsNotEmpty()
  dropoffAddress: string;

  @IsNumber()
  dropoffLatitude: number;

  @IsNumber()
  dropoffLongitude: number;

  @IsString()
  @IsOptional()
  promoCode?: string;

  @IsString()
  @IsIn(['WALLET', 'CASH', 'CARD'])
  paymentMethod: string;

  @IsDateString()
  @IsOptional()
  scheduledFor?: string;
}
