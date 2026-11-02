import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SaveAiKeyDto {
  @ApiProperty({ description: 'Llave de API (sk-ant-… para Claude, sk-… para OpenAI). Se prueba antes de guardarse y se guarda cifrada.' })
  @IsString()
  @MinLength(20, { message: 'La llave es demasiado corta.' })
  @MaxLength(400)
  apiKey: string;
}
