import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';

export class UpdateIntercityTripDto {
  @IsDateString()
  @IsOptional()
  departureTime?: string;

  @IsNumber()
  @IsOptional()
  availableSeats?: number;

  @IsNumber()
  @IsOptional()
  pricePerSeat?: number;

  @IsString()
  @IsOptional()
  status?: string;
}
