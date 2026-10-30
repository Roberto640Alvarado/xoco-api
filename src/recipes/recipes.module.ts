import { Module } from '@nestjs/common';
import { OdooModule } from '../odoo/odoo.module.js';
import { RecipesController } from './controllers/recipes.controller.js';
import { RecipesService } from './services/recipes.service.js';
import { RecipesRepository } from './repositories/recipes.repository.js';

// Recetas por tienda. Inventario importa este módulo para descontar los
// ingredientes de cada venta (RecipesService.findRecipeMap).
@Module({
  imports: [OdooModule],
  controllers: [RecipesController],
  providers: [RecipesService, RecipesRepository],
  exports: [RecipesService],
})
export class RecipesModule {}
