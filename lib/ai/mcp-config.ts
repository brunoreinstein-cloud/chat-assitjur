/**
 * MCP Tools — integração com servidores MCP externos via @ai-sdk/mcp.
 *
 * MCP (Model Context Protocol) permite que agentes usem ferramentas externas
 * como Gmail, Google Drive, Notion, GitHub, etc., sem precisar de código custom.
 *
 * Para activar um servidor MCP:
 *  1. Configurar as env vars correspondentes em .env.local
 *     (ex.: MCP_GMAIL_URL + MCP_GMAIL_TOKEN)
 *  2. Os tools ficam automaticamente disponíveis no chat
 *
 * Servidores MCP recomendados para AssistJur:
 *  - Gmail MCP: leitura/envio de e-mails de processos
 *  - Google Drive MCP: acesso a petições e contratos no Drive
 *  - Notion MCP: base de conhecimento do escritório no Notion
 *  - GitHub MCP: acesso a repositórios de templates de peças
 */

import { createMCPClient } from "@ai-sdk/mcp";

/** Configuração de um servidor MCP. */
export interface McpServerConfig {
  /** Nome amigável do servidor (para logs e debug). */
  name: string;
  /** URL do servidor MCP (SSE). */
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
    url: process.env.MCP_GMAIL_URL ?? "",
    authEnvVar: "MCP_GMAIL_TOKEN",
    description: "Leitura e envio de e-mails relacionados a processos",
  },
  gdrive: {
    name: "Google Drive MCP",
    url: process.env.MCP_GDRIVE_URL ?? "",
    authEnvVar: "MCP_GDRIVE_TOKEN",
    description: "Acesso a documentos e petições no Google Drive",
  },
  notion: {
    name: "Notion MCP",
    url: process.env.MCP_NOTION_URL ?? "",
    authEnvVar: "MCP_NOTION_TOKEN",
    description: "Base de conhecimento do escritório no Notion",
  },
};

/**
 * Retorna os servidores MCP configurados (com URL e token definidos).
 * Servidores sem token ou URL são ignorados silenciosamente.
 */
export function getConfiguredMcpServers(): McpServerConfig[] {
  return Object.values(MCP_SERVERS).filter(
    (server) => server.url.length > 0 && !!process.env[server.authEnvVar]
  );
}

/**
 * Verifica se algum servidor MCP está configurado.
 * Útil para mostrar/ocultar a opção de MCP no UI.
 */
export function hasMcpServers(): boolean {
  return getConfiguredMcpServers().length > 0;
}

/** Cache de clientes MCP (reutiliza conexões SSE entre requests). */
const mcpClientCache = new Map<string, ReturnType<typeof createMCPClient>>();

/**
 * Cria ou reutiliza um cliente MCP para o servidor dado.
 * Retorna null se o servidor não estiver configurado (sem URL ou token).
 */
async function getOrCreateMcpClient(
  serverName: string
): Promise<Awaited<ReturnType<typeof createMCPClient>> | null> {
  const config = MCP_SERVERS[serverName];
  if (!config) {
    return null;
  }

  const token = process.env[config.authEnvVar];
  if (!token || config.url.length === 0) {
    return null;
  }

  const cached = mcpClientCache.get(serverName);
  if (cached) {
    try {
      return await cached;
    } catch {
      mcpClientCache.delete(serverName);
    }
  }

  const clientPromise = createMCPClient({
    transport: {
      type: "sse",
      url: config.url,
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  mcpClientCache.set(serverName, clientPromise);

  try {
    return await clientPromise;
  } catch (err) {
    mcpClientCache.delete(serverName);
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[mcp] Falha ao conectar ao servidor MCP "${config.name}" (${config.url}):`,
        err instanceof Error ? err.message : err
      );
    }
    return null;
  }
}

/**
 * Retorna as tools de um servidor MCP específico.
 * Se o servidor não estiver configurado ou falhar, retorna objeto vazio.
 */
export async function getMcpTools(
  serverName: string
): Promise<Record<string, unknown>> {
  const client = await getOrCreateMcpClient(serverName);
  if (!client) {
    return {};
  }

  try {
    return await client.tools();
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[mcp] Falha ao obter tools do servidor MCP "${serverName}":`,
        err instanceof Error ? err.message : err
      );
    }
    return {};
  }
}

/**
 * Retorna todas as tools de todos os servidores MCP configurados,
 * combinadas num único objeto. Tools são prefixadas com o nome do servidor
 * para evitar colisões (ex.: gmail_sendEmail, gdrive_listFiles).
 *
 * Falhas em servidores individuais são silenciadas — os demais continuam.
 */
export async function getAllMcpTools(): Promise<Record<string, unknown>> {
  const servers = getConfiguredMcpServers();
  if (servers.length === 0) {
    return {};
  }

  const entries = Object.entries(MCP_SERVERS);
  const results = await Promise.allSettled(
    entries
      .filter(
        ([, config]) =>
          config.url.length > 0 && !!process.env[config.authEnvVar]
      )
      .map(async ([key]) => {
        const tools = await getMcpTools(key);
        // Prefixar tools com o nome do servidor para evitar colisões
        const prefixed: Record<string, unknown> = {};
        for (const [toolName, toolDef] of Object.entries(tools)) {
          prefixed[`${key}_${toolName}`] = toolDef;
        }
        return prefixed;
      })
  );

  const allTools: Record<string, unknown> = {};
  for (const result of results) {
    if (result.status === "fulfilled") {
      Object.assign(allTools, result.value);
    }
  }

  if (
    process.env.NODE_ENV === "development" &&
    Object.keys(allTools).length > 0
  ) {
    console.info(
      `[mcp] ${Object.keys(allTools).length} MCP tool(s) carregadas:`,
      Object.keys(allTools).join(", ")
    );
  }

  return allTools;
}

/**
 * Fecha todos os clientes MCP em cache.
 * Chamar em shutdown gracioso ou quando as credenciais mudam.
 */
export async function closeAllMcpClients(): Promise<void> {
  const clients = [...mcpClientCache.values()];
  mcpClientCache.clear();

  await Promise.allSettled(
    clients.map(async (clientPromise) => {
      try {
        const client = await clientPromise;
        await client.close();
      } catch {
        // Ignorar erros ao fechar
      }
    })
  );
}
