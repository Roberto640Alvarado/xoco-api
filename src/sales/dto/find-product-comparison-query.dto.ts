import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Dos rangos de días LOCALES de tienda a comparar, producto por producto.
// El "período A" es el principal (ej. el mes en curso) y el "período B" es
// contra el que se compara (ej. el mes anterior). Ambos son libres: meses
// completos, parciales o rangos personalizados — la pantalla ofrece
// atajos, pero la API no asume ninguno. Las reglas que no se pueden
// expresar con decoradores (inicio <= fin, rango máximo) las valida
// SalesService.findProductComparison con BadRequestException.
export class FindProductComparisonQueryDto {
  @ApiProperty({ example: '2026-10-01', description: 'Inicio del período A (incluido), YYYY-MM-DD.' })
  @IsDateString({}, { message: 'La fecha inicial del período A no es válida.' })
  periodAFrom!: string;

  @ApiProperty({ example: '2026-10-20', description: 'Fin del período A (incluido), YYYY-MM-DD.' })
  @IsDateString({}, { message: 'La fecha final del período A no es válida.' })
  periodATo!: string;

  @ApiProperty({ example: '2026-09-01', description: 'Inicio del período B (incluido), YYYY-MM-DD.' })
  @IsDateString({}, { message: 'La fecha inicial del período B no es válida.' })
  periodBFrom!: string;

  @ApiProperty({ example: '2026-09-30', description: 'Fin del período B (incluido), YYYY-MM-DD.' })
  @IsDateString({}, { message: 'La fecha final del período B no es válida.' })
  periodBTo!: string;

  @ApiPropertyOptional({
    description:
      'id de pos.config (tienda). Si se omite, se agregan todas las tiendas. Para un Vendedor se ignora y se ' +
      'usa siempre su propia tienda.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  posConfigId?: number;
}
