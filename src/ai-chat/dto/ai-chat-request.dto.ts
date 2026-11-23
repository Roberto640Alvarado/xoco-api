import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBase64, IsIn, IsMongoId, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { AI_ATTACHMENT_MIME_TYPES, MAX_AI_ATTACHMENTS, MAX_AI_ATTACHMENT_BASE64_LENGTH } from '../utils/ai-attachments.util.js';

export class AiAttachmentInputDto {
  @ApiProperty({ example: 'ventas-octubre.pdf' })
  @IsString()
  @MinLength(1, { message: 'Cada archivo necesita un nombre.' })
  @MaxLength(200, { message: 'El nombre del archivo es demasiado largo.' })
  name: string;

  @ApiProperty({ enum: AI_ATTACHMENT_MIME_TYPES, description: 'Imágenes (PNG, JPG, GIF, WebP), PDF o texto (TXT, CSV, Markdown, JSON). Los Excel los convierte el panel a CSV.' })
  @IsIn(AI_ATTACHMENT_MIME_TYPES, { message: 'Ese tipo de archivo no se puede leer. Sube imágenes, PDF, Excel, CSV o texto.' })
  mimeType: string;

  @ApiProperty({ description: 'Contenido del archivo en base64.' })
  @IsBase64({}, { message: 'El archivo no llegó bien. Vuelve a adjuntarlo.' })
  @MaxLength(MAX_AI_ATTACHMENT_BASE64_LENGTH, { message: 'Un archivo pesa más de lo permitido.' })
  data: string;
}

export class AiChatRequestDto {
  @ApiProperty({ enum: ['claude', 'openai'], description: 'Qué IA responde.' })
  @IsIn(['claude', 'openai'], { message: 'provider debe ser claude u openai.' })
  provider: 'claude' | 'openai';

  @ApiPropertyOptional({ description: 'Chat donde va la pregunta. Sin valor se crea un chat nuevo (llega en el evento "conversation").' })
  @IsOptional()
  @IsMongoId({ message: 'conversationId no es válido.' })
  conversationId?: string;

  @ApiProperty({ example: '¿Cómo le fue a Centrika en octubre?', description: 'Puede ir vacío si se adjuntan archivos.' })
  @IsString()
  @MaxLength(8000, { message: 'El mensaje es demasiado largo.' })
  message: string;

  @ApiPropertyOptional({ type: [AiAttachmentInputDto], description: `Hasta ${MAX_AI_ATTACHMENTS} archivos para que la IA los lea.` })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_AI_ATTACHMENTS, { message: `Puedes adjuntar hasta ${MAX_AI_ATTACHMENTS} archivos por mensaje.` })
  @ValidateNested({ each: true })
  @Type(() => AiAttachmentInputDto)
  attachments?: AiAttachmentInputDto[];
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
