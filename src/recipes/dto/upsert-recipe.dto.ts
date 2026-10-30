import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNumber, Max, Min, ValidateNested } from 'class-validator';

export const MAX_RECIPE_COMPONENTS = 20;
export const MAX_COMPONENT_QUANTITY = 1_000;

export class RecipeComponentInputDto {
  @ApiProperty({ example: 812, description: 'id de product.product en Odoo del ingrediente (ej. la cápsula Pacamara).' })
  @IsInt()
  @Min(1)
  productId: number;

  @ApiProperty({ example: 1, description: 'Cuánto se gasta de este ingrediente por cada unidad vendida.' })
  @IsNumber({}, { message: 'La cantidad debe ser un número.' })
  @Min(0.001, { message: 'La cantidad debe ser mayor a 0.' })
  @Max(MAX_COMPONENT_QUANTITY)
  quantity: number;
}

// Crea o reemplaza la receta de un producto en una tienda: la lista de
// ingredientes que viene aquí queda como la receta completa.
export class UpsertRecipeDto {
  @ApiProperty({ type: [RecipeComponentInputDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Agrega al menos un ingrediente.' })
  @ArrayMaxSize(MAX_RECIPE_COMPONENTS)
  @ValidateNested({ each: true })
  @Type(() => RecipeComponentInputDto)
  components: RecipeComponentInputDto[];
}
