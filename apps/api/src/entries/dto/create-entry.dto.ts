import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for posting validation
 */
export class CreatePostingDto {
  @IsString()
  @IsNotEmpty()
  accountCode: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  debit?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  credit?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  dimensions?: Record<string, string>;
}

/**
 * DTO for journal entry creation
 * Validates double-entry requirements
 */
export class CreateEntryDto {
  @IsString()
  @IsNotEmpty()
  date: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePostingDto)
  postings: CreatePostingDto[];

  @IsOptional()
  metadata?: Record<string, any>;
}
