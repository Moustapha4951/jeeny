import { IsString, IsNotEmpty } from 'class-validator';

export class ApproveDriverDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;
}

export class RejectDriverDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class SuspendDriverDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
