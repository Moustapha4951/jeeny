export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR';

export interface AdminResponseDto {
  id: string;
  userId: string;
  role: AdminRole;
  department?: string;
  createdAt: Date;
  user: {
    phone: string;
    name: string;
  };
}

export interface CreateAdminDto {
  userId: string;
  role: AdminRole;
  department?: string;
}

export interface UpdateAdminDto {
  role?: AdminRole;
  department?: string;
}
