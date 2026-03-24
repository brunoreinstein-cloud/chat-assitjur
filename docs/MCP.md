# Model Context Protocol (MCP) Integration

Documentação completa de integração com servidores MCP (Gmail, Google Drive, Notion, GitHub) no AssistJur.

---

## O que é MCP?

**Model Context Protocol** é um padrão aberto que permite que agentes de IA usem ferramentas externas (Gmail, Google Drive, etc.) **sem código custom**. O MCP funciona com SSE (Server-Sent Events) para comunicação entre o agente (AssistJur) e o servidor MCP (ex.: Gmail MCP).

### Benefícios

✅ **Sem código:** Integra novo serviço sem alterar o prompt do agente
✅ **Padrão aberto:** Compatível com qualquer provider (Gmail, Drive, Notion, GitHub, etc.)
✅ **Seguro:** Credenciais geridas separadamente, nunca no contexto do prompt
✅ **Plug-and-play:** Ativa configurando env vars

---

## Servidores MCP Disponíveis no AssistJur

### 1. Gmail MCP

**O que faz:** Ler e enviar e-mails diretamente do chat, sem sair da app.

**Use cases:**
- "Enviar contestação por email para o cliente"
- "Ler e-mail do cliente sobre o processo"
- "Buscar e-mails relacionados ao processo X"

**Tools disponíveis:**
- `read_emails` — Listar e-mails (últimos N, filtro por remetente/assunto)
- `get_email` — Ler conteúdo de um e-mail específico
- `send_email` — Enviar e-mail

### 2. Google Drive MCP

**O que faz:** Acesso a documentos, petições e contratos salvos no Drive.

**Use cases:**
- "Buscar contrato do cliente Y no Drive"
- "Listar documentos da pasta /processos/2026"
- "Enviar contestação gerada para a pasta do cliente"

**Tools disponíveis:**
- `list_files` — Listar ficheiros e pastas
- `read_file` — Ler conteúdo (suporta Google Docs, PDF, etc.)
- `create_file` — Criar novo ficheiro
- `upload_file` — Carregar ficheiro

### 3. Notion MCP

**O que faz:** Acesso à base de conhecimento hospedada em Notion (jurisprudência, teses, templates).

**Use cases:**
- "Buscar jurisprudência sobre CLT no Notion"
- "Listar templates de contestação da firma"
- "Adicionar nova tese jurídica à base"

**Tools disponíveis:**
- `search_pages` — Procurar páginas por texto
- `get_page` — Ler página específica
- `create_page` — Criar nova página
- `update_page` — Atualizar página

### 4. GitHub MCP

**O que faz:** Acesso a repositório de templates de petições e peças jurídicas.

**Use cases:**
- "Buscar template de contestação neste repositório"
- "Criar PR com nova peça jurídica"
- "Listar problemas (issues) de revisão de defesa"

**Tools disponíveis:**
- `list_files` — Listar arquivos/templates
- `read_file` — Ler conteúdo de template
- `search_code` — Procurar por texto no repo
- `create_issue` — Abrir issue
- `create_pr` — Enviar PR

---

## Setup Passo a Passo

### Pré-requisitos

1. **Conta Google** (para Gmail e Drive)
2. **Workspace Notion** (para Notion)
3. **Conta GitHub** (para GitHub)
4. **Servidor MCP rodando** (em produção, ex.: em um serviço separado)

### Opção A: Usar Servidores MCP Públicos (Recomendado)

Alguns fornecedores oferecem servidores MCP hosted (ex.: Anthropic, Vercel, etc.). Se disponível:

1. Copiar URL do servidor MCP (ex.: `https://mcp-gmail.example.com/`)
2. Gerar token de autenticação no fornecedor
3. Adicionar a env vars (ver Opção B)

### Opção B: Self-Hosted (Para Desenvolvimento)

Se quiseres testar MCP localmente:

```bash
# 1. Clonar um servidor MCP (ex.: Gmail)
git clone https://github.com/anthropics/mcp-server-gmail.git
cd mcp-server-gmail

# 2. Instalar dependências
npm install

# 3. Configurar credenciais
export GMAIL_EMAIL=seu_email@gmail.com
export GMAIL_PASSWORD=sua_senha_app
# ou para OAuth, seguir README do repo

# 4. Rodar servidor (output: http://localhost:3001)
npm start
```

---

## Configuração em Desenvolvimento

### 1. Adicionar em `.env.local`

```bash
# Gmail MCP (opcional)
MCP_GMAIL_URL=http://localhost:3001
MCP_GMAIL_TOKEN=seu_token_gmail

# Google Drive MCP (opcional)
MCP_GDRIVE_URL=http://localhost:3002
MCP_GDRIVE_TOKEN=seu_token_gdrive

# Notion MCP (opcional)
MCP_NOTION_URL=http://localhost:3003
MCP_NOTION_TOKEN=seu_token_notion

# GitHub MCP (opcional)
MCP_GITHUB_URL=http://localhost:3004
MCP_GITHUB_TOKEN=seu_token_github
```

### 2. Restart do Servidor Dev

```bash
pnpm dev
```

### 3. Testar no Chat

Abrir `/chat` e tentar:

```
@gmail enviar para cliente@example.com: "Cópia da contestação"
```

Se MCP está ativo, o agente usará a tool `send_email` automaticamente.

---

## Configuração em Produção (Vercel)

### 1. Criptografar Tokens (Recomendado)

**Nunca commitar tokens em plaintext.** Usar um serviço como:
- **Vercel Secret Encryption** (ao adicionar Environment Variables)
- **HashiCorp Vault**
- **AWS Secrets Manager**

### 2. Adicionar em Vercel Dashboard

1. Vercel → Teu projeto → Settings → **Environment Variables**
2. Para cada servidor MCP, adicionar:
   - `MCP_GMAIL_URL`: URL do servidor (ex.: `https://mcp-gmail.yourcompany.com`)
   - `MCP_GMAIL_TOKEN`: Token (será criptografado)
   - Repetir para Drive, Notion, GitHub

3. Marcar para ambientes: **Production** (e **Preview** se desejado)

### 3. Deploy

```bash
pnpm run vercel:deploy:prod
```

---

## Como Funciona Internamente

### Integração com AI SDK

Em `lib/ai/mcp-config.ts`, os servidores são definidos:

```typescript
export const MCP_SERVERS: Record<string, McpServerConfig> = {
  gmail: {
    name: "Gmail MCP",
    url: process.env.MCP_GMAIL_URL ?? "",
    authEnvVar: "MCP_GMAIL_TOKEN",
    description: "Leitura e envio de e-mails",
  },
  // ... outros servidores
};
```

### Fluxo de uma Chamada

1. **Agente recebe mensagem:** "Enviar contestação por email"
2. **Verifica MCP:** Se `MCP_GMAIL_URL` + token estão configurados, ativa Gmail MCP
3. **Valida servidor:** Tenta ligar ao servidor MCP (SSE connection)
4. **Tools ficam disponíveis:** Se conexão OK, `send_email` e outras tools são registadas
5. **Agente usa tool:** LLM decide usar `send_email`, passa parâmetros
6. **Tool executa:** Servidor MCP executa ação (enviar e-mail via Gmail)
7. **Resultado volta:** Tool retorna resposta (sucesso, ID do e-mail, etc.)

### Tratamento de Erros

Se MCP falhar:
- Tool retorna erro (sem quebrar chat)
- Agente pode tentar alternativa (ex.: pedir ao user para enviar manualmente)
- Chat continua funcionando com outras ferramentas

---

## Exemplos de Uso

### Exemplo 1: Enviar Contestação por E-mail

**User:** "Enviar a contestação para cliente@example.com"

**Fluxo:**
1. Agente gera contestação DOCX
2. Agente pede a tool `send_email` do Gmail MCP
3. Email é enviado com anexo
4. Agente confirma: "Contestação enviada para cliente@example.com"

**Prompt do agente:** Já inclui instrução para usar `@gmail` quando necessário enviar.

### Exemplo 2: Buscar Jurisprudência em Notion

**User:** "Qual é a jurisprudência mais recente sobre cláusulas leoninas?"

**Fluxo:**
1. Agente pede `search_pages` do Notion MCP
2. Notion MCP retorna últimas 5 páginas sobre "cláusulas leoninas"
3. Agente lê cada página com `get_page`
4. Agente sintetiza resposta para o user

### Exemplo 3: Criar PR com Nova Peça

**User:** "Adicionar nova peça de contestação ao repositório de templates"

**Fluxo:**
1. Agente cria ficheiro com nova peça
2. Agente pede `create_pr` do GitHub MCP
3. GitHub MCP abre PR no repositório
4. Agente fornece link: "PR aberto: github.com/sua-org/templates/pull/123"

---

## Ativar Servidores Gradualmente

**Recomendação:** Começar com um, testar, depois adicionar outros.

### Fase 1: Gmail (Semana 1)

Implementar `send_email` para agentes que precisam enviar contestações:

```bash
# Setup
export MCP_GMAIL_URL=https://seu-servidor-gmail.com
export MCP_GMAIL_TOKEN=seu_token

# Testar
pnpm dev
# No chat: @gmail enviar
```

### Fase 2: Google Drive (Semana 2)

Adicionar acesso a documentos:

```bash
export MCP_GDRIVE_URL=...
export MCP_GDRIVE_TOKEN=...
```

### Fase 3: Notion (Semana 3)

Integrar base de conhecimento:

```bash
export MCP_NOTION_URL=...
export MCP_NOTION_TOKEN=...
```

### Fase 4: GitHub (Semana 4)

Gerenciar templates no repositório.

---

## Troubleshooting

### "Tool não aparece no chat"

**Causa possível:** MCP não ativado.

**Verificar:**
```bash
# Ver logs do dev
pnpm dev
# Procurar por: "[mcp] Gmail MCP loaded" ou semelhante

# Se não aparecer, verificar:
# 1. POSTGRES_URL definida? (banco é necessário mesmo sem usar)
# 2. MCP_GMAIL_URL + MCP_GMAIL_TOKEN definidas?
# 3. Servidor MCP está rodando? (curl $MCP_GMAIL_URL)
```

### "Error: Could not connect to MCP server"

**Causa:** Servidor MCP indisponível ou URL incorreta.

**Solução:**
```bash
# Testar ligação
curl -v $MCP_GMAIL_URL

# Se der erro 404/403:
#   - Verificar URL (typo?)
#   - Verificar token (expirou?)
#   - Verificar firewall/rede

# Se der erro de timeout:
#   - Servidor está rodando?
#   - Porta correta? (ex.: 3001)
```

### Tool retorna "Permission denied" ou "Invalid token"

**Causa:** Credenciais inválidas ou expiradas.

**Solução:**
1. Verificar token no Vercel Environment Variables
2. Se OAuth, token pode ter expirado → regenerar
3. Verificar permissões da conta (ex.: Gmail deve ter 2FA desativado se usar password)

---

## Melhores Práticas

### 1. Documentar Credenciais

Criar um documento **INTERNO** (não em git) com:
- Como gerar tokens (para cada servidor)
- Quando expiram
- Como regenerar
- Quem mantém acesso

**Exemplo:**
```
Gmail:
  - Token gerado em 2026-03-01
  - Expira em 2027-03-01
  - Regenerado by: bruno@assistjur.com
  - Como regenerar: Google Cloud Console → APIs & Services → Credentials

Drive:
  - ...
```

### 2. Testar em Preview Deploy

Antes de colocar em Production:

1. Fazer push para branch de feature
2. Vercel cria Preview Deploy
3. Adicionar MCP_GMAIL_URL + token ao Preview
4. Testar no preview
5. Se OK, fazer merge para main

### 3. Monitorar Uso

Adicionar logs quando tool é usada:

```typescript
// Em lib/ai/mcp-config.ts ou no prompt do agente
console.log("[mcp] Tool used:", toolName, "by:", agentName, "at:", new Date().toISOString());
```

Depois revisar logs para ver qual servidores são realmente usados.

### 4. Fallback Strategy

Sempre ter alternativa se MCP falhar:

```
Agente: "Vou enviar o e-mail por Gmail. Se falhar, fornecerei o link do ficheiro para você enviar manualmente."
```

---

## Referência Rápida

| Servidor | URL Env | Token Env | Ativado | Status |
|----------|---------|-----------|--------|--------|
| Gmail | `MCP_GMAIL_URL` | `MCP_GMAIL_TOKEN` | ✓ | Pronto (ver secção Gmail) |
| Drive | `MCP_GDRIVE_URL` | `MCP_GDRIVE_TOKEN` | 🔄 | Pronto (ver secção Drive) |
| Notion | `MCP_NOTION_URL` | `MCP_NOTION_TOKEN` | 🔄 | Pronto (ver secção Notion) |
| GitHub | `MCP_GITHUB_URL` | `MCP_GITHUB_TOKEN` | 🔄 | Pronto (ver secção GitHub) |

*(✓ Implementado; 🔄 Planejado)*

---

## Próximos Passos

1. **Hoje:** Ler este doc e entender fluxo
2. **Amanhã:** Implementar Gmail MCP (server + config Vercel)
3. **Semana 1:** Testar no chat, ajustar prompts
4. **Semana 2+:** Adicionar Drive, Notion, GitHub progressivamente

---

**Documentação:**
- [Anthropic MCP Spec](https://modelcontextprotocol.io/) — Standard official
- `lib/ai/mcp-config.ts` — Implementação no código
- [AGENTS.md](../AGENTS.md) — Prompts dos agentes (como usar @gmail, etc.)
