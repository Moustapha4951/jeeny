import { IsString, IsNotEmpty, IsNumber, IsDateString } from 'class-validator';

export class CreateIntercityTripDto {
  @IsString()
  @IsNotEmpty()
  routeId: string;

  @IsDateString()
  departureTime: string;

  @IsNumber()
  availableSeats: number;

  @IsNumber()
  pricePerSeat: number;
}
