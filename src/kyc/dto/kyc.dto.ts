import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const KYC_DOC_KINDS = [
  'RCCM_CERT',
  'TAX_ID',
  'LEGAL_REP_ID',
  'OAPI_CERT',
  'OTHER',
] as const;

export class KycDocumentDto {
  @IsString()
  @IsIn([...KYC_DOC_KINDS])
  kind: (typeof KYC_DOC_KINDS)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  filename: string;

  @IsString()
  @IsNotEmpty()
  // accept both http(s) URLs and short data:URI references for now
  @MaxLength(2_000_000)
  url: string;

  @IsString()
  @MaxLength(120)
  mimeType: string;

  @IsInt()
  @Min(0)
  size: number;
}

export class SubmitKycDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  legalRepName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  legalRepRole: string;

  @IsString()
  @IsIn(['CNI', 'Passport', 'Permis'])
  legalRepIdType: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  legalRepIdNumber: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => KycDocumentDto)
  documents: KycDocumentDto[];
}

export class ReviewKycDto {
  @IsString()
  @IsIn(['approved', 'rejected'])
  decision: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectionReason?: string;
}
