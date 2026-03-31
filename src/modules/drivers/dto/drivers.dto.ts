export type DriverStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED' | 'INACTIVE';

export interface DriverResponseDto {
  id: string;
  name: string;
  phone: string;
  rating: number;
  trips: number;
  status: string; // Arabic label
  statusEn?: string; // Optional ENUM value
  vehicles: Array<{
    id: string;
    type: string;
    plateNumber: string;
    status: string;
  }>;
  licenseNumber?: string;
  isOnline?: boolean;
  currentLat?: number;
  currentLng?: number;
  wallet?: { balance: number } | null;
  recentRides?: Array<{
    id: string;
    rideNumber: string;
    status: string;
    fare: number;
    createdAt: Date;
    vehicleType?: { name: string; nameAr: string };
  }>;
}

export interface FindAllDriversDto {
  status?: DriverStatus | 'ALL';
  search?: string;
  page?: number;
  limit?: number;
}

export interface UpdateDriverStatusDto {
  status: DriverStatus;
  reason?: string;
}

export interface UpdateDriverBalanceDto {
  amount: number;
  reason: string;
}
