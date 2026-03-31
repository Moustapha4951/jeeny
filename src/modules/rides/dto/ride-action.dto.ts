import { IsString, IsNotEmpty, IsNumber } from 'class-validator';

export class AcceptRideDto {
  @IsString()
  @IsNotEmpty()
  rideId!: string;
}

export class CompleteRideDto {
  @IsString()
  @IsNotEmpty()
  rideId!: string;

  @IsNumber()
  actualDistance!: number;
}

export class CancelRideDto {
  @IsString()
  @IsNotEmpty()
  rideId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
