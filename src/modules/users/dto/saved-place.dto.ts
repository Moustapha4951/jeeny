import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreateSavedPlaceDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;
}

export class UpdateSavedPlaceDto {
  @IsString()
  @IsOptional()
  label?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;
}
