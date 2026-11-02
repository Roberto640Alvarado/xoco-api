import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AiChatRequestDto {
  @ApiProperty({ enum: ['claude', 'openai'], description: 'Qué IA responde.' })
  @IsIn(['claude', 'openai'], { message: 'provider debe ser claude u openai.' })
  provider: 'claude' | 'openai';

  @ApiPropertyOptional({ description: 'Chat donde va la pregunta. Sin valor se crea un chat nuevo (llega en el evento "conversation").' })
  @IsOptional()
  @IsMongoId({ message: 'conversationId no es válido.' })
  conversationId?: string;

  @ApiProperty({ example: '¿Cómo le fue a Centrika en octubre?' })
  @IsString()
  @MinLength(1, { message: 'Escribe una pregunta.' })
  @MaxLength(8000, { message: 'El mensaje es demasiado largo.' })
  message: string;
}

export class RenameConversationDto {
  @ApiProperty({ example: 'Ventas de Centrika' })
  @IsString()
  @MinLength(1, { message: 'El nombre no puede ir vacío.' })
  @MaxLength(120)
  title: string;
}

export class FindConversationsQueryDto {
  @ApiPropertyOptional({ description: 'Busca en el nombre del chat y en lo que se escribió.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
