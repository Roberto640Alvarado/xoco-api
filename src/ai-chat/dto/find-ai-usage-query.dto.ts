import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsOptional, Matches, Max, Min } from 'class-validator';

export class FindAiUsageQueryDto {
  @ApiPropertyOptional({ description: 'Día inicial (incluido), hora de El Salvador, YYYY-MM-DD. Por defecto, el 1 del mes de dateTo.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom debe ser YYYY-MM-DD.' })
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Día final (incluido), YYYY-MM-DD. Por defecto, hoy.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo debe ser YYYY-MM-DD.' })
  dateTo?: string;

  @ApiPropertyOptional({ enum: ['claude', 'openai'] })
  @IsOptional()
  @IsIn(['claude', 'openai'])
  provider?: 'claude' | 'openai';

  @ApiPropertyOptional({ description: 'Solo las consultas de este usuario.' })
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
