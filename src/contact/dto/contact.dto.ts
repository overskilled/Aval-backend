import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ContactInquiryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsEmail()
  @MaxLength(180)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  organisation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  message?: string;

  // Honeypot — should always be empty for real users.
  @IsOptional()
  @IsString()
  @MaxLength(0)
  website?: string;
}
