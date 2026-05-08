import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsUrl,
} from 'class-validator';

export class UpsertInstitutionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  legalName: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  tradeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  rccm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  oapiId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  sector: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsUrl({ require_protocol: false })
  website?: string;
}
