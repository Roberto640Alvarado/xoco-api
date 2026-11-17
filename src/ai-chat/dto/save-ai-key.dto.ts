import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SaveAiKeyDto {
  @ApiProperty({ description: 'Llave de API (sk-ant-… para Claude, sk-… para OpenAI). Se prueba antes de guardarse y se guarda cifrada.' })
  @IsString()
  @MinLength(20, { message: 'La llave es demasiado corta.' })
  @MaxLength(400)
  apiKey: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Si es true y la llave se guarda, el Gasto de este proveedor empieza de cero desde ahora (el historial no se borra).',
  })
  @IsOptional()
  @IsBoolean({ message: 'resetUsage debe ser verdadero o falso.' })
  resetUsage?: boolean;
}
