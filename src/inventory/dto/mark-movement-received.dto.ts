import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class MarkMovementReceivedDto {
  @ApiProperty({ example: 10, description: 'Cantidad real que llegó a la tienda (puede diferir de lo solicitado).' })
  @IsNumber()
  @Min(0)
  receivedQuantity: number;
}
