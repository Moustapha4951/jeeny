import { IsString, IsEnum, IsNotEmpty } from 'class-validator';

export enum DocumentType {
  LICENSE = 'license',
  NATIONAL_ID = 'national_id',
  PROFILE_PHOTO = 'profile_photo',
  VEHICLE_REG = 'vehicle_reg',
  INSURANCE = 'insurance',
  VEHICLE_PHOTO = 'vehicle_photo',
  CONTRACT = 'contract',
}

export class UploadDocumentDto {
  @IsEnum(DocumentType)
  @IsNotEmpty()
  documentType!: DocumentType;

  @IsString()
  @IsNotEmpty()
  fileUrl!: string;
}

