# Revisão de Dependências e Arquitetura

**Data:** 24 de março, 2026
**Status:** Análise completa com recomendações priorizadas

---

## 1. Dependências em Beta

### Status Atual
| Dependência | Versão | Tempo em Beta | Risco |
|---|---|---|---|
| `next-auth` | 5.0.0-beta.30 | 18+ meses | 🔴 ALTO |
| `react-data-grid` | 7.0.0-beta.47 | Longo período | 🔴 ALTO |
| `xlsx` | 0.18.5 | Estável (community) | 🟠 MÉDIO |

### Análise Detalhada

#### next-auth (5.0.0-beta.30)
- **Problema:** Versão beta ancorada há muito tempo; API muda entre releases
- **Impacto:** Auth em produção depende de beta instável
- **Recomendação:** Verificar se v5 saiu como stable nos últimos meses
  - Se sim → atualizar imediatamente (breaking changes esperados)
  - Se não → avaliar downgrade para v4 stable (se compatível com Next.js 16)
- **Esforço:** Médio (possível breaking changes em callbacks e tipos)

#### react-data-grid (7.0.0-beta.47)
- **Problema:** Beta prolongado em produção
- **Impacto:** Tabelas de processos e relatórios podem quebrar sem aviso
- **Recomendação:**
  - Checar estado do projeto (ativo? abandonado?)
  - Considerar alternativa: `TanStack Table v8` (stable, sem UI, mais flexível)
  - Se manter: fixar versão exata (não `^7.0.0-beta.47`)
- **Esforço:** Alto (mudança de componente seria refactor)

#### xlsx (0.18.5) + SheetJS Community
- **Problema:** Licença community ficou limitada; versão travada
- **Impacto:** Geração de XLSX em agentes pode estar afetada
- **Recomendação:**
  - Auditar uso atual (onde gera XLSX?)
  - Migrar para `exceljs` (MIT, API previsível, manutenido)
  - Ou usar `@microsoft/office-scripts` se integração com Excel é crítica
- **Esforço:** Baixo-Médio (wrappers de geração XLSX)

```bash
# Verificar uso atual de xlsx
grep -r "xlsx" lib app --include="*.ts" --include="*.tsx" | grep -i "import\|from"
```

**Ação Imediata:**
```bash
# Verificar versões estáveis disponíveis
npm view next-auth versions --json | tail -5
npm view react-data-grid versions --json | tail -5
```

---

## 2. Peso do Bundle

### Dependências Pesadas Identificadas
```
tesseract.js         ~15MB (OCR)
shiki                ~5MB (syntax highlighting)
pdfjs-dist           ~3MB (PDF rendering)
ProseMirror (stack)  ~2MB (6 pkgs)
CodeMirror (stack)   ~2MB (4 pkgs)
@xyflow/react        ~1.5MB (graph visualization)
katex                ~0.5MB (math rendering)
mammoth              ~0.5MB (DOCX parsing)
```

### Análise de Uso
| Lib | Uso Atual | Frequência | Candidato a Lazy |
|---|---|---|---|
| `tesseract.js` | OCR em AssistJur | Raro (~5% dos chats) | ✅ **SIM** |
| `shiki` | Syntax highlight em code blocks | Frequente (10-20%) | ⚠️ Considerar |
| `pdfjs-dist` | Rendering de PDF no chat | Frequente (40%) | ❌ Não |
| `ProseMirror` | Rich text editor (defesas) | Frequente (60%) | ❌ Não |
| `CodeMirror` | Code editor no chat | Frequente (20%) | ❌ Não |
| `katex` | Rendering de fórmulas | Muito raro (<1%) | ✅ **SIM** |
| `@xyflow/react` | Visualização de fluxos | Admin only | ✅ **SIM** |

### Recomendação Imediata
```bash
# Analisar bundle real
pnpm run analyze
```

Esperar output do webpack-bundle-analyzer. Prioridade: lazy-load `tesseract.js` e `katex`.

**Exemplo de lazy load para tesseract.js:**
```typescript
// lib/ocr.ts
export async function loadOCR() {
  const { recognize } = await import("tesseract.js");
  return recognize;
}
```

---

## 3. Múltiplas Libs de PDF

### Status Atual
| Lib | Versão | Uso | Sobreposição |
|---|---|---|---|
| `pdf-lib` | 1.17.1 | Criação/edição de PDFs | ⚠️ Duplicado |
| `pdfjs-dist` | 5.5.207 | Rendering/extração de PDFs | ⚠️ Duplicado |
| `unpdf` | 1.4.0 | Parsing/extração de PDF | ⚠️ **Duplicado** |

### Achado Concreto: unpdf Está Integrado
**Localizado em 5 arquivos críticos:**
```
lib/pdf/pdf-optimizer.ts           (compressão de PDFs com unpdf)
lib/upload/extract-pdf.ts          (extração principal com unpdf)
app/(chat)/api/processos/extract/  (intake de processos)
app/(chat)/api/processos/intake/   (extração de texto)
app/api/compress/                  (compressão de PDFs)
```

**Impacto:** `unpdf` é core para extração de PDFs em processos. Não remover sem migrar para `pdfjs-dist`.

### Recomendação Revisada
```
Manter: pdfjs-dist (Standard, manutenção ativa)
        + unpdf (integrado em extração — atual)
        + pdf-lib (edição de PDFs)

Ação: Não remover agora. Considerar substituição apenas após:
      1. Testar equivalência de pdfjs-dist
      2. Verificar performance de extração
      3. Migrar incrementalmente
```

**Esforço revisado:** Alto (refactor de 5+ arquivos)

---

### Status Tesseract.js
**Localizado em 2 arquivos:**
```
lib/upload/extract-docs.ts   (OCR de documentos DOCX/XLSX)
lib/upload/extract-pdf.ts    (OCR de PDFs escaneados)
```

**Uso:** Already lazy-loaded via `await import("tesseract.js")` ✅

**Otimização:** Adicionar code splitting adicional se usado em rota específica.

---

## 4. README — Melhorias de Apresentação

### Atual
- ✅ Funcionalidades bem descritas
- ✅ Stack resumida
- ✅ Instruções de setup claras
- ❌ Sem badges (status, versão, licença)
- ❌ Sem screenshot ou GIF
- ❌ Sem seção de Arquitetura
- ❌ Mistura doc técnica com product overview

### Recomendação

**Estrutura proposta:**
```
README.md (landing page do repo)
├── Badges (build, version, license)
├── Screenshot/GIF do produto
├── Pitch de 2-3 linhas
├── Quick links (funcionalidades, stack, setup)
├── Quick start (3 comandos)
└── Links para docs especializadas

docs/ARCHITECTURE.md (novo)
├── Diagrama 6-layer (já tem)
├── Descrição de cada agente
├── Fluxo de dados (chat → LLM → storage)
└── Decisões arquiteturais

docs/DESENVOLVIMENTO.md (novo)
├── Setup dev completo
├── Estrutura de pastas
├── Padrões de código
└── Debugging

docs/DEPLOYMENT.md (novo)
├── Vercel setup
├── Variáveis de ambiente
├── Migrações DB
└── Monitoramento
```

### Ações Concretas
1. Adicionar badges ao README (build, versão Next.js)
2. Criar `docs/ARCHITECTURE.md` com diagrama
3. Mover instruções de deploy para `docs/DEPLOYMENT.md`
4. Mover instruções de dev para `docs/DESENVOLVIMENTO.md`
5. Adicionar GIF rodando na Vercel (opcional, mas impactante)

---

## 5. Scripts — Organização

### Status Atual
- **Total:** 59 scripts (incluindo Vercel e DB)
- **No package.json:** 59 scripts
- **One-offs:** ~15 scripts não-recorrentes

### One-offs Identificados
```bash
db:add-agent-id          # Feature específica, não recorrente
db:seed-redator-banco    # Setup inicial, não recorrente
supabase:config-push     # Deploy setup, não recorrente
vercel:review            # Revisão, não recorrente
config:check             # Debug, não recorrente
health:ai                # Debug, não recorrente
benchmark:llm            # Performance test, não recorrente
```

### Recomendação

**Scripts recorrentes em package.json (manter):**
```json
{
  "dev": "...",
  "build": "...",
  "start": "...",
  "test": "...",
  "test:unit": "...",
  "lint": "...",
  "format": "...",
  "db:migrate": "...",
  "db:studio": "..."
}
```

**Scripts one-off em `scripts/` folder (documentar em README):**
```
scripts/
├── README.md           # Índice de scripts
├── db-add-agent-id.ts
├── db-seed-redator-banco.ts
├── health-ai.ts
└── ...
```

**Novo arquivo: `scripts/README.md`**
```markdown
# Scripts de Utilidade

## Setup
- `tsx db-seed-redator-banco.ts` — Seed de documentos iniciais
- `tsx db-add-agent-id.ts` — Migração one-off de agent IDs

## Debug
- `tsx health-ai.ts` — Verificar conexão com AI Gateway
- `tsx benchmark-llm.ts` — Benchmark de latência LLM

## Deploy
- `tsx pre-deploy.ts` — Checklist antes de push
```

**Ação:** Refatorar package.json, criar scripts/README.md, documentar no README principal.

---

## 6. Redis — Documentação

### Status Atual
- ✅ **Implementado:** `lib/cache/llm-response-cache.ts`
- ✅ **Uso:** Cache de respostas LLM (generateTitle, etc.)
- ❌ **Documentado:** Não mencionado em README ou docs

### Impacto
- Não está claro se Redis é obrigatório ou opcional
- Sem fallback documentado (em-memory cache em serverless)
- Produção pode falhar silenciosamente se Redis_URL não está configurado

### Recomendação

**Adicionar a docs/DEPLOYMENT.md:**
```markdown
## Cache de LLM (Redis)

### Opcional em Dev
Redis é opcional durante desenvolvimento. Se não configurado:
- Cache LLM é desabilitado (cada chat chama LLM)
- Performance é mais lenta, mas funciona

### Recomendado em Produção
Para reduzir latência e custos:
```bash
export REDIS_URL="redis://default:password@host:port"
pnpm run build
```

### Fallback em Serverless
Se Redis falhar em produção, chat continua funcionando (sem cache).
```

**Adicionar ao README:**
```markdown
### Cache & Performance
- **LLM Response Cache:** Redis (opcional, melhora performance)
- **Document Cache:** In-memory com TTL (instância Vercel)
- **DB Connection Pooling:** Supabase/Neon
```

---

## 7. MCP — Documentação (Completo)

### Status Atual
- ✅ **Implementado:** `lib/ai/mcp-config.ts`
- ✅ **Suporta:** Gmail, Google Drive, Notion, GitHub
- ❌ **Documentado:** Não está no README principal

### Recomendação

**Adicionar ao README após Stack:**
```markdown
## Model Context Protocol (MCP)

O AssistJur suporta integração com servidores MCP para acesso a ferramentas externas:

| Servidor | Ferramentas | Setup |
|----------|------------|-------|
| **Gmail MCP** | Leitura/envio de e-mails | `MCP_GMAIL_URL` + token |
| **Google Drive MCP** | Documentos e petições | `MCP_GDRIVE_URL` + token |
| **Notion MCP** | Base de conhecimento | `MCP_NOTION_URL` + token |
| **GitHub MCP** | Repositórios de templates | `MCP_GITHUB_URL` + token |

Ver [MCP.md](docs/MCP.md) para setup completo.
```

**Novo arquivo: `docs/MCP.md`**
```markdown
# Model Context Protocol (MCP)

## O que é?
MCP permite que agentes usem ferramentas externas (Gmail, Drive, etc.)
sem código custom.

## Como ativar?
1. Configurar variáveis de ambiente
2. Tools ficam automaticamente disponíveis no chat

## Exemplos
- Gmail MCP: "@gmail enviar para cliente@example.com"
- Drive MCP: "@drive buscar contrato.pdf"
```

---

## 8. Testes E2E — Status Atual

### Implementação Existente
```
tests/e2e/
├── api.test.ts
├── auth.test.ts
├── chat.test.ts
├── guest-setup.test.ts
├── model-selector.test.ts
└── ...
```

### Cobertura Atual
- ✅ Auth (login, guest mode)
- ✅ Chat basic (stream, history)
- ✅ API endpoints
- ❌ Agentes específicos (nenhum teste E2E)
- ❌ Smoke tests por agente
- ❌ Pipeline multi-chamadas (AssistJur Master)

### Recomendação

**Adicionar testes E2E:**
```bash
tests/e2e/agents/
├── agent-revisor-defesas.test.ts
├── agent-redator-contestacao.test.ts
├── agent-master.test.ts
└── smoke-tests.test.ts
```

**Exemplo de smoke test:**
```typescript
// tests/e2e/agents/smoke-tests.test.ts
test("Revisor de Defesas — smoke test", async ({ page }) => {
  await page.goto("/chat");
  // Selecionar agente
  await page.click('button:has-text("Revisor de Defesas")');
  // Enviar mensagem simples
  await page.fill("textarea", "Analise esta defesa...");
  await page.click('button:has-text("Enviar")');
  // Verificar resposta
  await expect(page.locator("text=Análise completa")).toBeVisible();
});
```

**Esforço:** Médio (5-10 testes por agente, ~40-80 horas total)

---

## Resumo de Ações Imediatas

### 🔴 Crítico (Esta Semana)
- [ ] Auditar versão estável de `next-auth` (potencial breaking change)
- [ ] Verificar status de `react-data-grid` (alternativa ou manter?)
- [ ] Rodar `pnpm run analyze` (mapa real de bundle)
- [ ] ✅ FEITO: Mapeamento de `unpdf` (core em extração de PDFs — manter)

### 🟠 Alto (Próximas 2 Semanas)
- [ ] Documentar Redis em `docs/DEPLOYMENT.md` (cache LLM, opcional em dev)
- [ ] Documentar MCP em `docs/MCP.md` (Gmail, Drive, Notion, GitHub)
- [ ] Refatorar scripts: mover one-offs para pasta, criar `scripts/README.md`
- [ ] Atualizar README com seção de MCP + cache

### 🟡 Médio (Próximas 4 Semanas)
- [ ] Criar `docs/ARCHITECTURE.md` com diagrama 6-layer
- [ ] Criar `docs/DEPLOYMENT.md` (Vercel, env vars, Redis)
- [ ] Criar `docs/DESENVOLVIMENTO.md` (setup dev, estrutura, padrões)
- [ ] Refactoring README (badges, screenshot, links para docs especializadas)
- [ ] Considerar migração `xlsx` → `exceljs` (auditar uso primeiro)

### 🟢 Baixa (Backlog)
- [ ] Smoke tests E2E por agente (5-10 testes iniciais)
- [ ] GIF do produto em ação (README)
- [ ] Otimizar lazy-load adicional se `tesseract.js` chegar a 15MB+

---

## Próximos Passos

1. **Hoje:** Rodar análise de bundle e verificar next-auth
2. **Amanhã:** Documentar MCP e Redis
3. **Esta semana:** Refatorar scripts e README
4. **Próximas semanas:** Lazy loading e testes E2E

Quer que eu comece por algum desses pontos?
