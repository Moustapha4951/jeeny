export type EmployeeRole =
  | 'DISPATCHER'
  | 'SUPPORT'
  | 'OPERATIONS'
  | 'FINANCE'
  | 'CALL_CENTER'
  | 'DRIVER_MANAGEMENT';

export interface EmployeeResponseDto {
  id: string;
  userId: string;
  employeeId: string;
  role: EmployeeRole;
  department: string;
  salary: string;
  hireDate: Date;
  isOnDuty: boolean;
  createdAt: Date;
  user: {
    phone: string;
    name: string;
  };
}

export interface CreateEmployeeDto {
  userId: string;
  employeeId: string;
  role: EmployeeRole;
  department: string;
  salary?: string;
  hireDate?: Date;
}

export interface UpdateEmployeeDto {
  role?: EmployeeRole;
  department?: string;
  salary?: string;
  isOnDuty?: boolean;
}
