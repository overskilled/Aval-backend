import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const MAX_BATCH_QUANTITY = 100_000;
export const MIN_BATCH_QUANTITY = 100;

export class CreateBatchDto {
  @IsString()
  @IsNotEmpty()
  skuId: string;

  @IsInt()
  @Min(MIN_BATCH_QUANTITY)
  @Max(MAX_BATCH_QUANTITY)
  requestedQuantity: number;

  @IsDateString()
  productionDate: string;

  @IsDateString()
  expiryDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  externalRef?: string;
}

export class ReviewBatchDto {
  @IsString()
  @IsIn(['approved', 'rejected'])
  decision: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectionReason?: string;
}
