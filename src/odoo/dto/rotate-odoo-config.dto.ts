import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class RotateOdooConfigDto {
  @ApiProperty({ description: 'API key de Odoo (execute_kw la pide junto al uid).' })
  @IsString()
  @MinLength(8, { message: 'El API key no parece válido (muy corto).' })
  apiKey: string;

  @ApiProperty({ description: 'id del usuario de Odoo dueño del API key.' })
  @IsInt()
  @Min(1)
  uid: number;

  @ApiPropertyOptional({ default: 30, description: 'Días de vigencia antes de que haya que rotarla de nuevo.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays: number = 30;
}
