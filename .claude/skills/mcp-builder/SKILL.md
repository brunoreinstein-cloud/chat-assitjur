---
name: mcp-builder
description: Constrói servidores MCP (Model Context Protocol) para o AssistJur. Use quando precisar expor novas ferramentas via MCP — acesso ao banco de processos, integração com PJe, ou novas fontes de dados para os agentes.
disable-model-invocation: true
allowed-tools: Read, Bash(pnpm *), Bash(npx *)
---

Construa um servidor MCP para o AssistJur seguindo as melhores práticas do protocolo.

## Alvo
$ARGUMENTS (ex: `servidor MCP para processos do PJe`, `MCP para banco de teses`, `MCP para consulta de jurisprudência`)

---

## Referências do projeto

| Item | Localização |
|------|-------------|
| Config MCP atual | `lib/ai/mcp-config.ts` |
| Documentação MCP | `docs/MCP.md` |
| Ferramentas existentes | `lib/ai/tools/` |
| Schema do banco | `lib/db/schema.ts` |

Ler `docs/MCP.md` e `lib/ai/mcp-config.ts` antes de começar.

---

## Fase 1 — Pesquisa e Planejamento

### 1.1 Definir tipo de servidor MCP

| Tipo | Quando usar |
|------|-------------|
| **Cobertura de API** | Expor endpoints existentes do AssistJur via MCP |
| **Ferramentas de fluxo** | Orquestrar sequências multi-passo (ex: analisar processo → gerar relatório) |
| **Fonte de dados** | Acesso read-only a processos, teses, jurisprudência |

### 1.2 Mapear ferramentas necessárias

Para cada ferramenta do servidor, definir:
```typescript
{
  name: string           // ex: "buscarProcesso"
  description: string    // o que faz (usado pelo LLM para decidir quando chamar)
  inputSchema: {         // parâmetros
    type: "object",
    properties: { ... },
    required: [...]
  },
  annotations: {
    readOnly: boolean,       // não modifica estado
    destructive: boolean,    // operação irreversível
    idempotent: boolean,     // mesmo resultado se chamado múltiplas vezes
  }
}
```

---

## Fase 2 — Implementação (TypeScript)

### 2.1 Estrutura do projeto MCP

```
lib/mcp/<nome-servidor>/
├── index.ts          # entry point, registra ferramentas
├── tools/
│   ├── <ferramenta>.ts
│   └── ...
├── client.ts         # cliente da API/DB
└── types.ts          # tipos compartilhados
```

### 2.2 Template base (TypeScript + SDK oficial)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

const server = new McpServer({
  name: "<nome>",
  version: "1.0.0",
})

server.tool(
  "nomeFerramenta",
  "Descrição clara do que a ferramenta faz e quando deve ser usada",
  {
    parametro: z.string().describe("descrição do parâmetro"),
  },
  async ({ parametro }) => {
    // implementação
    return {
      content: [{ type: "text", text: resultado }],
    }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
```

### 2.3 Padrões obrigatórios do AssistJur

- **Tratamento de erros consistente:** nunca deixar erro não tratado vazar para o LLM
- **Rastreabilidade:** logar chamadas com `processId` e `userId` quando aplicável
- **Zero invenção:** se dado não encontrado → retornar `null` explícito, nunca inferir
- **Respeitar RBAC:** verificar permissões do usuário antes de retornar dados sensíveis

---

## Fase 3 — Revisão e Testes

### 3.1 Checklist de qualidade

- [ ] Sem duplicação de código (DRY)
- [ ] Tratamento de erro em cada ferramenta
- [ ] Descrições das ferramentas são claras para o LLM
- [ ] Anotações `readOnly`/`destructive`/`idempotent` corretas
- [ ] TypeScript sem erros: `pnpm run check`

### 3.2 Testar com MCP Inspector

```bash
npx @modelcontextprotocol/inspector npx tsx lib/mcp/<nome>/index.ts
```

Verificar:
- Ferramentas aparecem listadas corretamente
- Schemas de entrada estão corretos
- Respostas estão no formato esperado

---

## Fase 4 — Registrar no projeto

### 4.1 Adicionar em `lib/ai/mcp-config.ts`

```typescript
{
  name: "<nome>",
  command: "npx",
  args: ["tsx", "lib/mcp/<nome>/index.ts"],
  env: {
    POSTGRES_URL: process.env.POSTGRES_URL,
  }
}
```

### 4.2 Documentar em `docs/MCP.md`

Adicionar:
- Nome e propósito do servidor
- Ferramentas expostas
- Exemplos de uso pelos agentes

---

## Fase 5 — Avaliação

Criar 10 perguntas de teste que um agente faria ao servidor:
1. Perguntas independentes entre si
2. Cobrindo casos extremos (não encontrado, erro de permissão, campo nulo)
3. Verificar que respostas são em XML estruturado quando necessário

Validar que o servidor responde corretamente a todas antes de considerar pronto.
