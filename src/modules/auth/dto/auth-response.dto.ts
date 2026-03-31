export class AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    phoneNumber: string;
    role: string;
    firstName?: string;
    lastName?: string;
  };
}
