import { plainToInstance } from 'class-transformer';
import { IsString, IsNotEmpty, IsEnum, IsOptional, validateSync } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL!: string;

  @IsString()
  @IsNotEmpty()
  FIREBASE_PROJECT_ID!: string;

  @IsString()
  @IsNotEmpty()
  FIREBASE_CLIENT_EMAIL!: string;

  @IsString()
  @IsNotEmpty()
  FIREBASE_PRIVATE_KEY!: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_MAPS_API_KEY!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  PORT: string = '3000';

  @IsString()
  @IsOptional()
  AGORA_APP_ID!: string;

  @IsString()
  @IsOptional()
  AGORA_APP_CERTIFICATE!: string;

  @IsString()
  @IsOptional()
  BANKILY_API_KEY!: string;

  @IsString()
  @IsOptional()
  BANKILY_API_URL!: string;

  @IsString()
  @IsOptional()
  SEDAD_API_KEY!: string;

  @IsString()
  @IsOptional()
  SEDAD_API_URL!: string;

  @IsString()
  @IsOptional()
  MASRVI_API_KEY!: string;

  @IsString()
  @IsOptional()
  MASRVI_API_URL!: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
