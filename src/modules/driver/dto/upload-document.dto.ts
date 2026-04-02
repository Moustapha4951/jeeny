import { IsString, IsEnum, IsNotEmpty } from 'class-validator';

export enum DocumentType {
  LICENSE = 'license',
  NATIONAL_ID = 'national_id',
  PROFILE_PHOTO = 'profile_photo',
}

export class UploadDocumentDto {
  @IsEnum(DocumentType)
  @IsNotEmpty()
  documentType: DocumentType;

  @IsString()
  @IsNotEmpty()
  fileUrl: string;
}
