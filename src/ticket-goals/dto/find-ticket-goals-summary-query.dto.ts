import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FindTicketGoalsSummaryQueryDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiProperty({ example: 9, description: 'Mes 1-12.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}
