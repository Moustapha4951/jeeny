import { IsString, IsEnum, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

export enum DocumentType {
  LICENSE = 'LICENSE',
  NATIONAL_ID = 'NATIONAL_ID',
  PROFILE_PHOTO = 'PROFILE_PHOTO',
  VEHICLE_REG = 'VEHICLE_REG',
  INSURANCE = 'INSURANCE',
  VEHICLE_PHOTO = 'VEHICLE_PHOTO',
  CONTRACT = 'CONTRACT',
}

export class UploadDocumentDto {
  @IsEnum(DocumentType)
  @IsNotEmpty()
  documentType!: DocumentType;

  @IsString()
  @IsNotEmpty()
  fileUrl!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
