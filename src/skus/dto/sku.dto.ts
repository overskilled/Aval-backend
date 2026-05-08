import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PackagingType, SkuCategory } from '@prisma/client';

export class CreateSkuDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @IsEnum(SkuCategory)
  category: SkuCategory;

  @IsEnum(PackagingType)
  packaging: PackagingType;

  @IsInt()
  @Min(50)
  @Max(20_000)
  declaredVolumeMl: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  // Allow letters, digits, dashes and {placeholder} tokens (e.g. AVL-{YYMM}-{SEQ})
  @Matches(/^[A-Za-z0-9\-_{}]+$/, {
    message:
      'Batch format may only contain letters, digits, dashes, underscores and {…} tokens',
  })
  batchFormat: string;
}

export class UpdateSkuDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsEnum(SkuCategory)
  category?: SkuCategory;

  @IsOptional()
  @IsEnum(PackagingType)
  packaging?: PackagingType;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(20_000)
  declaredVolumeMl?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9\-_{}]+$/)
  batchFormat?: string;
}

export class ReviewSkuDto {
  @IsString()
  @IsIn(['approved', 'rejected'])
  decision: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectionReason?: string;
}
