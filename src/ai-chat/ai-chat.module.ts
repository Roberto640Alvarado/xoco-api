import { Module } from '@nestjs/common';
import { McpModule } from '../mcp/mcp.module.js';
import { UsersModule } from '../users/users.module.js';
import { AiChatController } from './controllers/ai-chat.controller.js';
import { AnthropicProvider } from './providers/anthropic.provider.js';
import { OpenAiProvider } from './providers/openai.provider.js';
import { AiChatService } from './services/ai-chat.service.js';
import { AiChatToolsService } from './services/ai-chat-tools.service.js';
import { AiKeysService } from './services/ai-keys.service.js';
import { AiUsageService } from './services/ai-usage.service.js';
import { AiKeysRepository } from './repositories/ai-keys.repository.js';
import { AiUsageRepository } from './repositories/ai-usage.repository.js';
import { AiConversationsRepository } from './repositories/ai-conversations.repository.js';
import { AiConversationsService } from './services/ai-conversations.service.js';

// Xoco IA: chat del panel con Claude u OpenAI sobre las mismas herramientas
// de solo lectura del conector MCP, más gráficas y tablas.
@Module({
  imports: [McpModule, UsersModule],
  controllers: [AiChatController],
  providers: [AiChatService, AiChatToolsService, AnthropicProvider, OpenAiProvider, AiKeysService, AiUsageService, AiKeysRepository, AiUsageRepository, AiConversationsRepository, AiConversationsService],
})
export class AiChatModule {}
