import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class FindRecipesQueryDto {
  @ApiProperty({ example: 3, description: 'id de pos.config (tienda).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  posConfigId: number;
}
