import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { FAVICON_ICO, ICON_PNG } from '../utils/brand-icon.util.js';

// Logo del dominio de la API: Claude y ChatGPT lo usan como ícono del
// conector (antes daba 404 y el conector salía sin ícono).
@ApiExcludeController()
@Public()
@Controller()
export class BrandIconController {
  @Get('favicon.ico')
  favicon(@Res() res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type('image/x-icon').send(FAVICON_ICO);
  }

  @Get(['icon.png', 'apple-touch-icon.png'])
  icon(@Res() res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type('image/png').send(ICON_PNG);
  }
}
