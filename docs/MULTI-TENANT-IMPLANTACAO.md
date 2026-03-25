# Arquitetura Multi-Tenant — Documento de Implantação

**Versão:** 1.0
**Data:** 2026-03-24
**Status:** Planejamento — pré-implementação
**Escopo:** Migração do modelo single-tenant (por usuário) para multi-tenant (organização → usuário → cliente)

---

## 1. Diagnóstico do Estado Atual

### 1.1 O que existe hoje

O sistema opera como **single-tenant por usuário**: cada `User` é uma unidade isolada com seus próprios chats, processos, knowledge base e créditos. Não existe o conceito de "escritório" ou "organização" — dois advogados do mesmo escritório são, para o sistema, dois usuários completamente independentes.

**Schema atual relevante:**

```
User (id, email, password, role)
  └─ Chat (userId FK)
  └─ Processo (userId FK)
  └─ KnowledgeDocument (userId FK)
  └─ KnowledgeFolder (userId FK)
  └─ CustomAgent (userId FK)
  └─ UserCreditBalance (userId PK)
  └─ UserMemory (userId FK)
  └─ UserFile (userId FK)
```

**RBAC implementado (Sprint 5/6):** 6 roles na tabela `User` — `cliente`, `paralegal`, `adv_junior`, `adv_pleno`, `adv_senior`, `socio`. Verificação via `can(role, action)` em `lib/rbac/`. O role é individual, não organizacional.

### 1.2 Problemas estruturais que a proposta resolve

| Problema | Impacto atual | Solução multi-tenant |
|---|---|---|
| Dois advogados do mesmo escritório não compartilham contexto | Conhecimento duplicado, trabalho redundante | Organização como container compartilhado |
| Logo, assinatura e templates hardcoded no Knowledge | Frágil, difícil de manter, não escalável | Configuração por organização |
| Não há como saber quem gerou qual documento | Sem auditoria operacional | userId no documento + workflow de aprovação |
| RBAC individual sem hierarquia de equipe | Role `socio` não tem visibilidade diferenciada | Perfis com escopo organizacional |
| Dados de clientes diferentes na mesma base de conhecimento | Risco de contaminação (Cenário 5b já documentado) | Sub-tenant por cliente-empresa |
| Créditos por usuário individual | Não reflete modelo de faturamento B2B | Cota por organização + consumo por usuário |

### 1.3 O que NÃO muda

- Stack técnico (Next.js 15, Drizzle, Postgres, AI SDK)
- Fluxo de chat e streaming
- Sistema de agentes e ferramentas
- RBAC base (expandido, não substituído)
- Migrations SQL incrementais

---

## 2. Arquitetura Alvo

### 2.1 Hierarquia de entidades

```
Organization (Escritório / Departamento Jurídico)
  │  Unidade de faturamento. Container de dados isolado.
  │
  ├─ User (Advogado / Estagiário / Gestor)
  │    Membro da organização com role específico.
  │    Pode ser membro de apenas uma organização.
  │
  └─ ClienteEmpresa (DPSP, GPA, OXXO...)
       Sub-tenant dentro da organização.
       Container de processos, templates e knowledge.
       │
       ├─ Processo (vinculado a cliente, não só a usuário)
       ├─ KnowledgeDocument (escopo: org | cliente)
       └─ Template (branding do cliente)
```

### 2.2 Princípio de isolamento

**Regra fundamental:** Nenhuma query deve retornar dados de uma organização diferente da do usuário autenticado. Isso é **arquitetural**, não dependente de filtros na camada de aplicação.

Implementação: todas as tabelas de dados sensíveis recebem `organizationId FK`. As queries em `lib/db/queries/` recebem `organizationId` como parâmetro obrigatório, extraído da sessão.

---

## 3. Schema Proposto — Novas Tabelas

### 3.1 `Organization`

```sql
CREATE TABLE "Organization" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt"       TIMESTAMP NOT NULL DEFAULT now(),
  "name"            VARCHAR(256) NOT NULL,          -- Razão social ou nome fantasia
  "cnpj"            VARCHAR(18),                    -- CNPJ sede (formatado: 00.000.000/0000-00)
  "slug"            VARCHAR(64) UNIQUE,             -- URL-friendly: "autuori-advogados"
  "plan"            VARCHAR(32) NOT NULL DEFAULT 'trial',  -- trial | contencioso | due_diligence | enterprise
  "status"          VARCHAR(16) NOT NULL DEFAULT 'active', -- active | suspended | cancelled

  -- Branding da organização
  "logoHeaderUrl"   TEXT,                           -- URL Vercel Blob: logo para header de documentos
  "logoFooterUrl"   TEXT,                           -- URL Vercel Blob: logo para rodapé
  "assinaturaUrl"   TEXT,                           -- URL Vercel Blob: imagem de assinatura padrão
  "corPrimaria"     VARCHAR(7),                     -- Hex: "#1A2B3C"
  "corSecundaria"   VARCHAR(7),
  "enderecoCompleto" TEXT,                          -- Para rodapé de documentos
  "oabsSocios"      JSONB,                          -- [{ nome, oab, estado }]

  -- Configuração de cotas
  "creditBalance"   INTEGER NOT NULL DEFAULT 0,     -- Créditos da organização (pool)
  "monthlyQuota"    INTEGER NOT NULL DEFAULT 500,   -- Processos/mês inclusos no plano
  "usageThisMonth"  INTEGER NOT NULL DEFAULT 0,     -- Consumo corrente (reset todo dia 1)
  "quotaResetAt"    TIMESTAMP,                      -- Próximo reset de cota

  -- Metadados
  "billingEmail"    VARCHAR(256),
  "notes"           TEXT                            -- Notas internas (admin)
);

CREATE INDEX ON "Organization"("slug");
CREATE INDEX ON "Organization"("status");
```

### 3.2 `OrganizationMember` (tabela de relação)

```sql
CREATE TABLE "OrganizationMember" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId"  UUID NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "userId"          UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "role"            VARCHAR(32) NOT NULL,  -- admin | adv_senior | adv_pleno | adv_junior | paralegal | estagiario
  "joinedAt"        TIMESTAMP NOT NULL DEFAULT now(),
  "invitedBy"       UUID REFERENCES "User"("id") ON DELETE SET NULL,
  "status"          VARCHAR(16) NOT NULL DEFAULT 'active', -- active | suspended | pending_invite

  UNIQUE("organizationId", "userId")
);

CREATE INDEX ON "OrganizationMember"("userId");
CREATE INDEX ON "OrganizationMember"("organizationId", "status");
```

### 3.3 `ClienteEmpresa`

```sql
CREATE TABLE "ClienteEmpresa" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId"  UUID NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "createdAt"       TIMESTAMP NOT NULL DEFAULT now(),
  "createdBy"       UUID REFERENCES "User"("id") ON DELETE SET NULL,

  -- Identificação
  "razaoSocial"     VARCHAR(256) NOT NULL,
  "nomeFantasia"    VARCHAR(256),
  "cnpjSede"        VARCHAR(18),                    -- Validado ao cadastrar
  "cnpjFiliais"     JSONB,                          -- ["00.000.000/0001-00", ...]
  "grupoEconomico"  VARCHAR(256),                   -- "Grupo DPSP", "Grupo GPA"
  "aliases"         JSONB,                          -- ["Droga Raia", "Drogasil", "DPSP"] — para match em PDF

  -- Templates e branding
  "logoUrl"         TEXT,                           -- Logo do cliente (relatórios client-facing)
  "templateRelatorio" TEXT,                         -- ID do template de relatório específico
  "modulosHabilitados" JSONB,                       -- ["M12", "M07", "M13"] ou null = todos

  -- Metadados
  "status"          VARCHAR(16) NOT NULL DEFAULT 'active', -- active | archived
  "notes"           TEXT
);

CREATE INDEX ON "ClienteEmpresa"("organizationId", "status");
CREATE INDEX ON "ClienteEmpresa"("organizationId", "cnpjSede");
```

---

## 4. Migrações nas Tabelas Existentes

### 4.1 Colunas a adicionar

Todas as tabelas de dados de negócio recebem `organizationId` (NOT NULL após backfill):

```sql
-- Fase 1: adicionar coluna nullable
ALTER TABLE "Processo"           ADD COLUMN "organizationId" UUID REFERENCES "Organization"("id") ON DELETE CASCADE;
ALTER TABLE "Processo"           ADD COLUMN "clienteEmpresaId" UUID REFERENCES "ClienteEmpresa"("id") ON DELETE SET NULL;
ALTER TABLE "Chat"               ADD COLUMN "organizationId" UUID REFERENCES "Organization"("id") ON DELETE CASCADE;
ALTER TABLE "KnowledgeDocument"  ADD COLUMN "organizationId" UUID REFERENCES "Organization"("id") ON DELETE CASCADE;
ALTER TABLE "KnowledgeDocument"  ADD COLUMN "clienteEmpresaId" UUID REFERENCES "ClienteEmpresa"("id") ON DELETE SET NULL;
ALTER TABLE "KnowledgeFolder"    ADD COLUMN "organizationId" UUID REFERENCES "Organization"("id") ON DELETE CASCADE;
ALTER TABLE "CustomAgent"        ADD COLUMN "organizationId" UUID REFERENCES "Organization"("id") ON DELETE CASCADE;
ALTER TABLE "UserFile"           ADD COLUMN "organizationId" UUID REFERENCES "Organization"("id") ON DELETE CASCADE;

-- Fase 2: backfill (ver seção 7)
-- Fase 3: tornar NOT NULL
ALTER TABLE "Processo"           ALTER COLUMN "organizationId" SET NOT NULL;
-- (repetir para todas)
```

### 4.2 Índices adicionais

```sql
-- Processos por organização (lista de processos no painel)
CREATE INDEX ON "Processo"("organizationId", "createdAt" DESC);
CREATE INDEX ON "Processo"("organizationId", "clienteEmpresaId");

-- Knowledge por organização e cliente
CREATE INDEX ON "KnowledgeDocument"("organizationId", "clienteEmpresaId");
CREATE INDEX ON "KnowledgeDocument"("organizationId", "indexingStatus");

-- Chats por organização
CREATE INDEX ON "Chat"("organizationId", "createdAt" DESC);
```

### 4.3 Tabela `UserCreditBalance` → `OrganizationCreditBalance`

A cota de créditos migra de individual para organizacional:

```sql
CREATE TABLE "OrganizationCreditBalance" (
  "organizationId"  UUID PRIMARY KEY REFERENCES "Organization"("id") ON DELETE CASCADE,
  "balance"         INTEGER NOT NULL DEFAULT 0,
  "updatedAt"       TIMESTAMP NOT NULL DEFAULT now()
);
```

A tabela `UserCreditBalance` pode ser mantida para rastrear consumo individual dentro da organização (relatório de uso por advogado), mas o "saldo" que limita execuções passa a ser da organização.

---

## 5. Mudanças na Camada de Autenticação

### 5.1 Sessão estendida

```typescript
// auth.ts — extensão da sessão NextAuth

interface Session {
  user: {
    id: string;
    type: 'guest' | 'regular';
    role: string | null;               // role individual (legacy)

    // NOVO — multi-tenant
    organizationId: string | null;     // org ativa
    orgRole: OrgRole | null;           // role dentro da org
    orgPlan: string | null;            // para feature flags no cliente
  }
}

type OrgRole =
  | 'org_admin'       // Configura tudo: usuários, clientes, templates
  | 'adv_senior'      // Acesso total + configuração de estratégia
  | 'adv_pleno'       // Módulos operacionais completos
  | 'adv_junior'      // Módulos operacionais, sem minutas de alta complexidade
  | 'paralegal'       // Relatórios + extração, sem minutas
  | 'estagiario'      // Relatórios simples, sem peças
```

### 5.2 Resolução da organização ativa

```typescript
// lib/auth/resolve-org.ts

export async function resolveActiveOrg(userId: string): Promise<{
  organizationId: string;
  orgRole: OrgRole;
  orgPlan: string;
} | null> {
  // 1. Busca a membria ativa do usuário
  // 2. Se membro de múltiplas orgs: usa org_active_id na UserMemory ou primeira
  // 3. Retorna null para usuários sem organização (contas legadas / solo)
}
```

### 5.3 Middleware de tenant

```typescript
// middleware.ts — adicionar ao existing middleware

export async function tenantMiddleware(req: NextRequest) {
  const session = await getSession(req);
  if (!session?.user?.organizationId) return; // usuário solo ou guest — sem tenant

  // Injeta organizationId no header para as API routes
  req.headers.set('x-organization-id', session.user.organizationId);
  req.headers.set('x-org-role', session.user.orgRole ?? '');
}
```

---

## 6. Mudanças nas Queries (lib/db/queries/)

### 6.1 Padrão de assinatura

Todas as queries sensíveis recebem `organizationId` como parâmetro e filtram por ele:

```typescript
// ANTES
export async function getProcessosByUserId(userId: string) {
  return db.select().from(Processo).where(eq(Processo.userId, userId));
}

// DEPOIS
export async function getProcessosByOrg(
  organizationId: string,
  options?: { userId?: string; clienteEmpresaId?: string }
) {
  const conditions = [eq(Processo.organizationId, organizationId)];
  if (options?.userId) conditions.push(eq(Processo.userId, options.userId));
  if (options?.clienteEmpresaId) conditions.push(eq(Processo.clienteEmpresaId, options.clienteEmpresaId));

  return db.select().from(Processo).where(and(...conditions));
}
```

### 6.2 Novas queries necessárias

```typescript
// lib/db/queries/organizations.ts
createOrganization(data: InsertOrganization): Promise<Organization>
getOrganizationById(id: string): Promise<Organization | null>
getOrganizationBySlug(slug: string): Promise<Organization | null>
updateOrganization(id: string, data: Partial<Organization>): Promise<void>
listOrganizationsForAdmin(): Promise<Organization[]>  // superadmin

// lib/db/queries/members.ts
addMember(orgId: string, userId: string, role: OrgRole): Promise<void>
removeMember(orgId: string, userId: string): Promise<void>
getMembersByOrg(orgId: string): Promise<Member[]>
getMemberOrgs(userId: string): Promise<{ org: Organization; role: OrgRole }[]>
updateMemberRole(orgId: string, userId: string, role: OrgRole): Promise<void>

// lib/db/queries/clientes.ts
createClienteEmpresa(data: InsertClienteEmpresa): Promise<ClienteEmpresa>
getClientesByOrg(orgId: string): Promise<ClienteEmpresa[]>
getClienteById(id: string, orgId: string): Promise<ClienteEmpresa | null>  // sempre com orgId!
findClienteByMatch(orgId: string, text: string): Promise<ClienteEmpresa | null>  // match aliases+CNPJ
updateClienteEmpresa(id: string, orgId: string, data: Partial<ClienteEmpresa>): Promise<void>
```

---

## 7. Plano de Backfill (Dados Existentes)

O sistema tem usuários ativos com processos, chats e knowledge existentes. A migração não pode quebrar esses dados.

### 7.1 Estratégia

```
Fase A — Criar org "solo" para cada usuário existente
  → Cada usuário legado vira uma organização de 1 pessoa
  → organizationId populado em todas as tabelas
  → Usuário mantém acesso exatamente como antes

Fase B — Consolidação manual (fora do código)
  → Administrador consolida usuários do mesmo escritório
  → Transfere processos/knowledge para a org consolidada
  → Desativa as orgs "solo" individuais

Fase C — Ativar features multi-tenant
  → Convite de membros, gestão de clientes, templates organizacionais
```

### 7.2 Script de backfill

```typescript
// lib/db/migrations/backfill-organizations.ts
// Executar UMA VEZ após a migration que adiciona as tabelas

async function backfillOrganizations() {
  const users = await db.select().from(User).where(eq(User.type, 'regular'));

  for (const user of users) {
    // Cria org individual
    const [org] = await db.insert(Organization).values({
      name: `Organização de ${user.email}`,
      plan: 'trial',
      status: 'active',
    }).returning();

    // Cria membership como admin
    await db.insert(OrganizationMember).values({
      organizationId: org.id,
      userId: user.id,
      role: 'org_admin',
    });

    // Backfill em todas as tabelas
    await db.update(Processo)
      .set({ organizationId: org.id })
      .where(eq(Processo.userId, user.id));

    await db.update(Chat)
      .set({ organizationId: org.id })
      .where(eq(Chat.userId, user.id));

    await db.update(KnowledgeDocument)
      .set({ organizationId: org.id })
      .where(eq(KnowledgeDocument.userId, user.id));

    // ... demais tabelas
  }
}
```

---

## 8. Novas Rotas de API

### 8.1 Organização

```
GET    /api/organization              — dados da org ativa
PUT    /api/organization              — atualizar branding/configurações (org_admin)
GET    /api/organization/members      — listar membros
POST   /api/organization/members      — convidar membro
PUT    /api/organization/members/[id] — alterar role
DELETE /api/organization/members/[id] — remover membro
```

### 8.2 Clientes-empresa

```
GET    /api/clientes                  — listar clientes da org
POST   /api/clientes                  — cadastrar cliente (admin + adv_senior)
GET    /api/clientes/[id]             — detalhes do cliente
PUT    /api/clientes/[id]             — atualizar cliente
DELETE /api/clientes/[id]             — arquivar cliente (não deleta dados)
GET    /api/clientes/match?q=texto    — busca por alias/CNPJ (usado no processamento de PDF)
```

### 8.3 Cotas e uso

```
GET    /api/organization/usage        — consumo do mês (processos, créditos, usuários ativos)
GET    /api/organization/credits      — saldo de créditos da org
POST   /api/organization/credits/add  — adicionar créditos (superadmin)
```

---

## 9. Mudanças na Camada de Agentes e Contexto

### 9.1 Injeção de contexto organizacional

O prompt do sistema deve incluir as configurações da organização ativa:

```typescript
// lib/ai/prompts.ts — expandir buildSystemPrompt()

interface OrgContext {
  orgName: string;
  logoHeaderUrl?: string;
  assinaturaUrl?: string;
  enderecoCompleto?: string;
  oabsSocios?: { nome: string; oab: string; estado: string }[];
}

interface ClienteContext {
  razaoSocial: string;
  cnpjs: string[];
  aliases: string[];
  grupoEconomico?: string;
  templateRelatorio?: string;
}

// No sistema:
// ANTES: dados de branding hardcoded no Knowledge ("LOGO_HEADER.png")
// DEPOIS: injetados via orgContext e carregados da tabela Organization
```

### 9.2 Seleção de contexto por cliente

Ao selecionar um `clienteEmpresaId` no `ProcessoSelector`, o backend:

1. Carrega os dados do `ClienteEmpresa` (CNPJs, aliases, template)
2. Filtra o RAG para retornar apenas documentos desse cliente (`clienteEmpresaId`)
3. Injeta os aliases no prompt (previne confusão Pacheco vs. São Paulo)
4. Usa o template do cliente se disponível, senão usa o da organização

```typescript
// lib/ai/context-builder.ts (novo arquivo)

export async function buildClienteContext(
  organizationId: string,
  clienteEmpresaId?: string
): Promise<ClienteContext | null> {
  if (!clienteEmpresaId) return null;

  const cliente = await getClienteById(clienteEmpresaId, organizationId);
  if (!cliente) return null;

  return {
    razaoSocial: cliente.razaoSocial,
    cnpjs: [cliente.cnpjSede, ...(cliente.cnpjFiliais ?? [])].filter(Boolean),
    aliases: cliente.aliases ?? [],
    grupoEconomico: cliente.grupoEconomico,
    templateRelatorio: cliente.templateRelatorio,
  };
}
```

### 9.3 Template em cascata

```
Nível 1: template padrão do sistema
    ↓ (override se existir)
Nível 2: template da organização (branding do escritório)
    ↓ (override se existir)
Nível 3: template do cliente (ex: relatório DPSP tem colunas diferentes de relatório GPA)
    ↓ (override se existir)
Nível 4: template do módulo (M07 vs M12 vs M13)
```

---

## 10. Workflow de Aprovação (Novo)

Para documentos gerados por perfis júnior/estagiário:

### 10.1 Estados de uma Peca

```sql
-- Adicionar à tabela Peca
ALTER TABLE "Peca" ADD COLUMN "approvalStatus" VARCHAR(16) NOT NULL DEFAULT 'rascunho';
-- rascunho | aguardando_revisao | aprovado | devolvido

ALTER TABLE "Peca" ADD COLUMN "reviewedBy" UUID REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "Peca" ADD COLUMN "reviewedAt" TIMESTAMP;
ALTER TABLE "Peca" ADD COLUMN "reviewNotes" TEXT;
```

### 10.2 Regras por role

| Role gerador | Documento | Fluxo |
|---|---|---|
| `estagiario` | Qualquer | Gera como `rascunho`, não pode exportar |
| `paralegal` | Relatório simples | Gera como `aprovado` automaticamente |
| `paralegal` | Minuta | Gera como `aguardando_revisao` |
| `adv_junior` | Relatório | Gera como `aprovado` automaticamente |
| `adv_junior` | Recurso | Gera como `aguardando_revisao` |
| `adv_pleno` + acima | Qualquer | Gera como `aprovado` automaticamente |

### 10.3 Notificação de revisão pendente

A ser implementada via:
- Badge no painel "Aguardando revisão (3)"
- Filtro no `ProcessoSelector` / painel de peças
- (Futuro) email ou notificação push para o responsável

---

## 11. Auditoria e Rastreabilidade

### 11.1 Enriquecer `TaskExecution`

```sql
ALTER TABLE "TaskExecution" ADD COLUMN "organizationId" UUID REFERENCES "Organization"("id") ON DELETE CASCADE;
ALTER TABLE "TaskExecution" ADD COLUMN "clienteEmpresaId" UUID REFERENCES "ClienteEmpresa"("id") ON DELETE SET NULL;
ALTER TABLE "TaskExecution" ADD COLUMN "agentVersion" VARCHAR(64);  -- snapshot do agentId + instrução hash
ALTER TABLE "TaskExecution" ADD COLUMN "inputDocumentIds" JSONB;    -- IDs dos PDFs usados
ALTER TABLE "TaskExecution" ADD COLUMN "reviewRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TaskExecution" ADD COLUMN "reviewedAt" TIMESTAMP;
ALTER TABLE "TaskExecution" ADD COLUMN "reviewedBy" UUID REFERENCES "User"("id");
```

### 11.2 Campos de auditoria em `Peca`

```sql
ALTER TABLE "Peca" ADD COLUMN "organizationId" UUID NOT NULL REFERENCES "Organization"("id");
ALTER TABLE "Peca" ADD COLUMN "clienteEmpresaId" UUID REFERENCES "ClienteEmpresa"("id");
ALTER TABLE "Peca" ADD COLUMN "taskExecutionId" UUID REFERENCES "TaskExecution"("id");
ALTER TABLE "Peca" ADD COLUMN "inputFileHash" VARCHAR(64);  -- SHA-256 do PDF de entrada
ALTER TABLE "Peca" ADD COLUMN "agentId" VARCHAR(64);
ALTER TABLE "Peca" ADD COLUMN "modelId" VARCHAR(64);
```

Com isso, uma peça pode ser rastreada de volta: quem gerou → quando → qual PDF de entrada → qual agente → qual modelo.

---

## 12. Modelo Comercial e Cotas

### 12.1 Planos sugeridos

| Plano | Usuários | Processos/mês | Módulos disponíveis | Créditos inclusos |
|---|---|---|---|---|
| `trial` | 1 | 20 | M12 (relatório simples) | 500 |
| `contencioso` | 5 | 200 | M12, M13, M09, minutas | 10.000 |
| `due_diligence` | 10 | 500 | Todos os 34 módulos | 30.000 |
| `enterprise` | Ilimitado | Ilimitado | Todos + customizações | Negociado |

### 12.2 Controle de cota

```typescript
// lib/credits/org-quota.ts (novo)

export async function checkOrgQuota(organizationId: string): Promise<{
  allowed: boolean;
  reason?: string;
  usageThisMonth: number;
  monthlyQuota: number;
}> {
  const org = await getOrganizationById(organizationId);
  if (!org) return { allowed: false, reason: 'org_not_found' };
  if (org.status !== 'active') return { allowed: false, reason: 'org_suspended' };
  if (org.usageThisMonth >= org.monthlyQuota) return {
    allowed: false,
    reason: 'monthly_quota_exceeded',
    usageThisMonth: org.usageThisMonth,
    monthlyQuota: org.monthlyQuota,
  };
  return { allowed: true, usageThisMonth: org.usageThisMonth, monthlyQuota: org.monthlyQuota };
}

export async function incrementOrgUsage(organizationId: string): Promise<void> {
  await db.update(Organization)
    .set({ usageThisMonth: sql`"usageThisMonth" + 1` })
    .where(eq(Organization.id, organizationId));
}
```

---

## 13. Decisões em Aberto

As perguntas abaixo precisam de resposta antes da implementação das fases 2 e 3:

### 13.1 Modelo de dados de cliente

**Pergunta:** Um escritório pode atender DPSP e Raia Drogasil simultaneamente (concorrentes)?

- **Se sim:** O isolamento de `ClienteEmpresa` já resolve — DPSP e Raia são sub-tenants separados, sem cross-contamination de contexto.
- **Se não:** Adicionar campo `conflito_de_interesses` e bloquear cadastro de empresas do mesmo setor na mesma org.

**Recomendação:** Implementar isolamento mas não bloquear. A responsabilidade ética é do escritório (OAB regulamenta conflito de interesse externamente ao sistema).

### 13.2 Departamento jurídico interno como tenant direto

**Pergunta:** O jurídico interno da DPSP pode ser uma "organização" diretamente (B2B) ou sempre passa por um escritório (B2B2B)?

- **Impacto:** Se B2B direto, o modelo de precificação muda (sem intermediário). A arquitetura proposta já suporta ambos — um `Organization` pode ser um escritório ou um departamento interno.
- **Recomendação:** Suportar ambos com o mesmo schema. O campo `Organization.type` pode distinguir: `escritorio | departamento_interno | solo`.

### 13.3 Retenção de PDFs

**Pergunta:** Os PDFs de processos ficam armazenados (Vercel Blob) ou são processados e descartados?

- **Armazenar:** Melhor UX (re-processamento, auditoria). Custo de storage. Implicações LGPD: dados sensíveis de terceiros (reclamantes) exigem política de retenção e mecanismo de exclusão.
- **Descartar após processamento:** Mais simples do ponto de vista de compliance. Já funciona hoje: `parsedText` fica no Processo, Blob é opcional.
- **Recomendação:** Manter como opcional (atual). Adicionar campo `Processo.pdfRetentionPolicy` — `discard_after_processing | retain_30d | retain_indefinitely`. Padrão: `discard_after_processing`.

### 13.4 Módulos customizáveis

**Pergunta:** Cada organização pode criar seus próprios assistentes além dos 34 padrão?

- **Já existe:** `CustomAgent` com `baseAgentId`. O modelo está implementado.
- **O que falta:** Escopo organizacional para custom agents (hoje é por usuário). Adicionar `organizationId` em `CustomAgent`.
- **Teses proprietárias:** Se um escritório quiser teses que não sejam compartilhadas com outros escritórios, basta que o Custom Agent seja organizacional (já isolado pelo `organizationId`).

### 13.5 Integrações externas

**Pergunta:** Integração com eLaw, PJe API, Legal One é in-scope?

- **Impacto arquitetural:** Integrações externas viram uma camada de `Integration` por organização, com credenciais criptografadas por org.
- **Recomendação:** Fora do escopo da migração multi-tenant. Documentar como "Fase 4" separada.

---

## 14. Plano de Implementação em Fases

### Fase 1 — Fundação Multi-Tenant (4–6 semanas)
Sem quebrar funcionalidade existente.

- [ ] Migration: criar tabelas `Organization`, `OrganizationMember`, `ClienteEmpresa`
- [ ] Migration: adicionar `organizationId` nullable em `Processo`, `Chat`, `KnowledgeDocument`, `KnowledgeFolder`, `CustomAgent`, `UserFile`, `Peca`, `TaskExecution`
- [ ] Script de backfill: criar org "solo" para cada usuário existente
- [ ] Migration: tornar `organizationId` NOT NULL após backfill
- [ ] Estender sessão NextAuth com `organizationId` e `orgRole`
- [ ] Criar `lib/db/queries/organizations.ts`, `members.ts`, `clientes.ts`
- [ ] Atualizar queries existentes para filtrar por `organizationId`
- [ ] Criar rotas `/api/organization` (CRUD básico)
- [ ] Testes: validar que usuários existentes não perdem acesso

**Critério de conclusão:** Sistema funciona exatamente como antes, mas dados já têm `organizationId` populado.

### Fase 2 — Gestão de Equipe e Clientes (3–4 semanas)

- [ ] UI: painel "Minha Organização" (branding, membros, plano)
- [ ] UI: convidar membros por email (fluxo de convite com token)
- [ ] UI: CRUD de clientes-empresa com validação de CNPJ
- [ ] Lógica de match: `findClienteByMatch()` chamada no processamento de PDF
- [ ] Prompt injection: `orgContext` e `clienteContext` no sistema do agente
- [ ] Template em cascata: org → cliente → módulo
- [ ] Roles organizacionais: `orgRole` substituindo `role` individual nos guards de permissão
- [ ] Testes: isolamento entre organizações (tenant A não vê dados do tenant B)

**Critério de conclusão:** Um escritório com múltiplos advogados consegue operar como equipe, com clientes cadastrados e contexto automaticamente injetado.

### Fase 3 — Workflow, Auditoria e Cotas (3–4 semanas)

- [ ] Migration: `approvalStatus` + campos de revisão em `Peca`
- [ ] UI: fila de revisão ("Aguardando aprovação")
- [ ] Lógica: aprovação automática por role (tabela da seção 10.2)
- [ ] UI: bloquear export de peças não aprovadas para estagiários
- [ ] Audit trail: enriquecer `TaskExecution` com campos de rastreabilidade
- [ ] Sistema de cotas: `checkOrgQuota()` chamado no início de cada processamento
- [ ] UI: dashboard de uso da organização (processos/mês, créditos consumidos por usuário)
- [ ] Reset mensal de cota (cron job)

**Critério de conclusão:** Fluxo completo: estagiário gera → advogado revisa → aprovado → exportável. Org com cota esgotada recebe mensagem clara.

### Fase 4 — Produto (ongoing)

- Convite por link com código de organização
- Onboarding wizard (upload de logo, configurar assinatura, adicionar primeiro cliente)
- White-label por organização (subdomínio `escritorio.assistjur.com.br`)
- Integrações externas (eLaw, PJe API)
- Billing integration (Stripe ou Iugu)
- Plano enterprise com SLA e suporte dedicado

---

## 15. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Backfill corrompendo dados existentes | Baixa | Alto | Rodar em staging primeiro; backup antes da migration; backfill em transação por usuário |
| Query sem `organizationId` vazar dados cross-tenant | Média | Crítico | Code review obrigatório em toda query nova; lint rule para detectar queries sem filtro de org |
| Performance degradada por índices extras | Baixa | Médio | Índices criados `CONCURRENTLY` em produção |
| Sessão sem `organizationId` quebrando rotas | Média | Alto | Fase 1 mantém fallback: se `organizationId == null`, comportamento igual ao atual |
| Custo de storage de logos/branding por org | Baixa | Baixo | Vercel Blob tem custo marginal baixo; limitar tamanho de upload (max 2MB por imagem) |

---

## 16. Referências Cruzadas

| Documento | Relação |
|---|---|
| `SPEC-ASSISTJUR-V9.md` | Arquitetura atual — ponto de partida da migração |
| `PLANO-PROXIMOS-PASSOS.md` | Sprints concluídos e próximas tarefas |
| `SPEC-AI-DRIVE-JURIDICO.md` | 34 módulos e campos — base dos templates por cliente |
| `PROCESSO-TASKEXECUTION.md` | Schema de TaskExecution a ser enriquecido |
| `SPEC-CREDITOS-LLM.md` | Sistema de créditos a ser migrado para nível org |
| `PRECIFICACAO-WHITELABEL-ESCRITORIOS.md` | Modelo comercial detalhado |
| `AGENTES-IA-PERSONALIZADOS.md` | CustomAgent — escopo a ser migrado para org |
| `HUMAN-IN-THE-LOOP.md` | `requestApproval` — base do workflow de aprovação |

---

*Documento gerado em 2026-03-24 com base na análise do codebase atual (Sprints 1–6 concluídos) e na proposta de regras de negócio multi-tenant fornecida.*
