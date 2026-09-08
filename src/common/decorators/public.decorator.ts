import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca un endpoint como público, permitiendo el acceso sin token JWT.
 * El JwtAuthGuard global revisa este metadato para omitir la validación.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
