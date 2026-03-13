/**
 * MCP Tools — Cookbook pattern.
 * Configuração e scaffold para integração com servidores MCP externos.
 *
 * MCP (Model Context Protocol) permite que agentes usem ferramentas externas
 * como Gmail, Google Drive, Notion, GitHub, etc., sem precisar de código custom.
 *
 * Status: scaffold — activa quando @ai-sdk/mcp estiver disponível e
 * as variáveis de ambiente MCP_* estiverem configuradas.
 *
 * Para activar:
 *  1. Instalar: pnpm add @ai-sdk/mcp
 *  2. Configurar as env vars abaixo em .env.local
 *  3. Descomentar as importações e chamar getMcpTools() no route.ts
 *
 * Servidores MCP recomendados para AssistJur:
 *  - Gmail MCP: leitura/envio de e-mails de processos
 *  - Google Drive MCP: acesso a petições e contratos no Drive
 *  - Notion MCP: base de conhecimento do escritório no Notion
 *  - GitHub MCP: acesso a repositórios de templates de peças
 */

/** Configuração de um servidor MCP. */
export interface McpServerConfig {
  /** Nome amigável do servidor (para logs e debug). */
  name: string;
  /** URL do servidor MCP (SSE ou WebSocket). */
  url: string;
  /** Variável de ambiente que guarda o token de autenticação. */
  authEnvVar: string;
  /** Descrição das tools disponíveis (para documentação). */
  description: string;
}

/**
 * Mapa de servidores MCP disponíveis.
 * Cada entrada é activada se a variável de ambiente correspondente estiver definida.
 */
export const MCP_SERVERS: Record<string, McpServerConfig> = {
  gmail: {
    name: "Gmail MCP",
    url: process.env.MCP_GMAIL_URL ?? "https://mcp.gmail.com/sse",
    authEnvVar: "MCP_GMAIL_TOKEN",
    description: "Leitura e envio de e-mails relacionados a processos",
  },
  gdrive: {
    name: "Google Drive MCP",
    url: process.env.MCP_GDRIVE_URL ?? "https://mcp.gdrive.com/sse",
    authEnvVar: "MCP_GDRIVE_TOKEN",
    description: "Acesso a documentos e petições no Google Drive",
  },
  notion: {
    name: "Notion MCP",
    url: process.env.MCP_NOTION_URL ?? "https://mcp.notion.com/sse",
    authEnvVar: "MCP_NOTION_TOKEN",
    description: "Base de conhecimento do escritório no Notion",
  },
};

/**
 * Retorna os servidores MCP configurados (com variável de ambiente definida).
 * Servidores sem token são ignorados silenciosamente.
 */
export function getConfiguredMcpServers(): McpServerConfig[] {
  return Object.values(MCP_SERVERS).filter(
    (server) => !!process.env[server.authEnvVar]
  );
}

/**
 * Verifica se algum servidor MCP está configurado.
 * Útil para mostrar/ocultar a opção de MCP no UI.
 */
export function hasMcpServers(): boolean {
  return getConfiguredMcpServers().length > 0;
}

/**
 * Stub para quando o AI SDK suportar MCP nativamente.
 *
 * Quando @ai-sdk/mcp estiver disponível, substituir por:
 * ```typescript
 * import { experimental_createMCPClient } from 'ai';
 *
 * export async function getMcpTools(serverName: string) {
 *   const config = MCP_SERVERS[serverName];
 *   if (!config) return {};
 *   const token = process.env[config.authEnvVar];
 *   if (!token) return {};
 *
 *   const client = await experimental_createMCPClient({
 *     transport: {
 *       type: 'sse',
 *       url: config.url,
 *       headers: { Authorization: `Bearer ${token}` },
 *     },
 *   });
 *   return client.tools();
 * }
 * ```
 *
 * Por agora, retorna tools vazias (sem-op).
 */
export function getMcpTools(
  _serverName: string
): Promise<Record<string, never>> {
  return Promise.resolve({});
}
