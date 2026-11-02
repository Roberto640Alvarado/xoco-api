import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Logger, NotFoundException, Param, ParseEnumPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { User } from '../../common/decorators/user.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface.js';
import { UsersService } from '../../users/services/users.service.js';
import { AiChatRequestDto, FindConversationsQueryDto, RenameConversationDto } from '../dto/ai-chat-request.dto.js';
import { AiConversationsService } from '../services/ai-conversations.service.js';
import { AiChatEvent, AiChatService } from '../services/ai-chat.service.js';
import { AiKeysService } from '../services/ai-keys.service.js';
import { AiUsageService } from '../services/ai-usage.service.js';
import { SaveAiKeyDto } from '../dto/save-ai-key.dto.js';
import { FindAiUsageQueryDto } from '../dto/find-ai-usage-query.dto.js';

const PROVIDER_PARAM = new ParseEnumPipe(['claude', 'openai'], { exceptionFactory: () => new NotFoundException('Proveedor de IA desconocido.') });

// Xoco IA (chat del panel): solo Super admin. Las llaves de Claude y OpenAI
// viven solo en el servidor.
@ApiTags('ai-chat')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN)
@Controller('ai-chat')
export class AiChatController {
  private readonly logger = new Logger(AiChatController.name);

  constructor(
    private readonly chatService: AiChatService,
    private readonly usersService: UsersService,
    private readonly keysService: AiKeysService,
    private readonly usageService: AiUsageService,
    private readonly conversations: AiConversationsService,
  ) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Chats del usuario conectado (solo los suyos), el más reciente primero. "search" busca en el nombre y en los mensajes.' })
  listConversations(@User() user: AuthenticatedUser, @Query() query: FindConversationsQueryDto) {
    return this.conversations.list(user.id, query.search);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Un chat con todos sus mensajes (solo si es del usuario conectado).' })
  getConversation(@User() user: AuthenticatedUser, @Param('id') id: string) {
    return this.conversations.get(id, user.id);
  }

  @Patch('conversations/:id')
  @ApiOperation({ summary: 'Cambia el nombre de un chat propio.' })
  renameConversation(@User() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RenameConversationDto) {
    return this.conversations.rename(id, user.id, dto.title);
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borra un chat propio con todos sus mensajes.' })
  async removeConversation(@User() user: AuthenticatedUser, @Param('id') id: string) {
    await this.conversations.remove(id, user.id);
  }

  @Get('keys')
  @ApiOperation({ summary: 'Llaves de API de Claude y OpenAI: de dónde salen, últimos 4 caracteres y resultado de la última prueba.' })
  keys() {
    return this.keysService.list();
  }

  @Put('keys/:provider')
  @ApiOperation({
    summary: 'Guarda (o reemplaza) la llave de un proveedor. Antes la prueba con una petición mínima: si es inválida no se guarda; sin crédito se guarda con aviso.',
  })
  saveKey(@Param('provider', PROVIDER_PARAM) provider: 'claude' | 'openai', @Body() dto: SaveAiKeyDto, @User() user: AuthenticatedUser) {
    return this.keysService.save(provider, dto.apiKey, user.email);
  }

  @Post('keys/:provider/test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Vuelve a probar la llave en uso (válida, con crédito y con acceso al modelo).' })
  testKey(@Param('provider', PROVIDER_PARAM) provider: 'claude' | 'openai') {
    return this.keysService.test(provider);
  }

  @Delete('keys/:provider')
  @ApiOperation({ summary: 'Quita la llave guardada en el panel (si hay variable en el servidor, se vuelve a usar esa).' })
  removeKey(@Param('provider', PROVIDER_PARAM) provider: 'claude' | 'openai') {
    return this.keysService.remove(provider);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Gasto de Xoco IA: totales, por día, por IA y por usuario, y cada consulta (fecha y hora, usuario, modelo, tokens y costo).' })
  usage(@Query() query: FindAiUsageQueryDto) {
    return this.usageService.find(query);
  }

  @Get('config')
  @ApiOperation({ summary: 'Proveedores de IA disponibles (Claude / ChatGPT) y el modelo fijo de cada uno.' })
  config() {
    return this.chatService.config();
  }

  @Post('stream')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Pregunta a Xoco IA dentro de un chat (o crea uno). Responde como text/event-stream con eventos conversation, start, tool, text, chart, table, done y error; pregunta y respuesta quedan guardadas.',
  })
  async stream(@Body() dto: AiChatRequestDto, @User() authUser: AuthenticatedUser, @Res() res: Response) {
    // Valida antes de abrir el stream: así un proveedor sin llave da 400 normal.
    await this.chatService.resolve(dto.provider);
    const user = await this.usersService.findById(authUser.id);
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    const controller = new AbortController();
    res.on('close', () => controller.abort());

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const emit = (event: AiChatEvent | { type: 'conversation' | 'title'; id: string; title: string }) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    // Latido para que proxies no corten la conexión mientras la IA piensa.
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, 15_000);

    try {
      await this.conversations.ask({
        user,
        provider: dto.provider,
        conversationId: dto.conversationId,
        message: dto.message,
        signal: controller.signal,
        emit,
      });
    } catch (error) {
      const message = error instanceof NotFoundException ? error.message : 'Ocurrió un error inesperado.';
      if (!(error instanceof NotFoundException)) this.logger.error('Xoco IA: error inesperado', error instanceof Error ? error.stack : String(error));
      emit({ type: 'error', message });
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  }
}
