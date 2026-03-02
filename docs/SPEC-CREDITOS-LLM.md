# Especificação: Créditos por consumo de LLM

Modelo de "crédito" por consumo de LLM: transparente para o utilizador e gerível pelo administrador.

---

## 1. Objetivos

- **Utilizador:** Ver saldo de créditos, consumo por pedido e histórico recente; ser avisado quando o saldo estiver baixo; mensagem clara quando não houver créditos.
- **Administrador:** Atribuir/ajustar créditos por utilizador, ver uso por utilizador e por período, definir saldo inicial por tipo de utilizador (guest/regular).

---

## 2. Modelo de créditos

### 2.1 Unidade

- **1 crédito = 1000 tokens** (input + output somados). Fórmula: `credits = ceil((promptTokens + completionTokens) / 1000)`.
- Configurável via constante (e depois via env ou tabela de config) para permitir ajuste sem alterar código.
- Opcional futuro: preços diferentes por modelo (ex.: modelo “premium” consumir mais créditos por token).

### 2.2 Saldo

- Cada utilizador tem um **saldo** (número inteiro de créditos). Saldo inicial ao criar conta/guest definido por tipo (ex.: guest 20, regular 100).
- Cada pedido de chat (após conclusão do stream) desconta créditos conforme o `totalUsage` devolvido pelo modelo.
- Se saldo < créditos necessários: pode-se optar por (a) bloquear o pedido ou (b) permitir saldo negativo (débito) e apenas registar; esta spec assume **bloquear** quando saldo insuficiente para manter controlo de custos.

### 2.3 Onde se consome

| Uso                    | Onde registar                         |
|------------------------|----------------------------------------|
| Chat principal         | `POST /api/chat` (onFinish)           |
| Título do chat         | Opcional: registar em uso ou ignorar  |
| Artefactos / sugestões | Futuro: mesmo modelo de débito        |

Na primeira fase, só se regista e desconta no **chat principal** (streamText). Título e artefactos podem ficar fora do sistema de créditos ou ser incluídos depois.

---

## 3. Transparência para o utilizador

### 3.1 O que o utilizador vê

1. **Saldo atual**  
   Ex.: "150 créditos" no header ou na sidebar. Atualizado após cada resposta (ou por polling/refetch da API de créditos).

2. **Consumo por resposta**  
   Opcional: no final de cada mensagem do assistente, indicar "~2 créditos (1.234 tokens)" ou enviar via data stream (ex.: `data-usage`) para o cliente mostrar num tooltip.

3. **Histórico recente**  
   Página ou secção "Uso" com últimas N utilizações: data, tokens, créditos, modelo (opcional).

4. **Avisos**  
   - Saldo &lt; 20% do inicial (ou &lt; 10 créditos): aviso "Está a ficar com poucos créditos."
   - Saldo = 0 (ou &lt; 1 crédito): botão "Enviar" desativado ou mensagem "Sem créditos. Contacte o administrador para recarregar."

5. **Mensagem ao bloquear**  
   Se o pedido for rejeitado por saldo insuficiente: "Não tem créditos suficientes para este pedido. Saldo atual: X créditos."

### 3.2 API para o cliente

- **GET /api/credits** (query opcional: `?limit=10`–50, default 10)  
  - Resposta: `{ balance: number, recentUsage: Array<{ id, chatId, promptTokens, completionTokens, creditsConsumed, createdAt }>, lowBalanceThreshold: number }`.  
  - Usado para: mostrar saldo, lista de uso recente, e decidir se mostra aviso de saldo baixo.

### 3.3 Página "Uso e créditos"

- **Rota:** `/uso` (requer autenticação; redireciona para login se não houver sessão).
- **Conteúdo:** saldo em destaque, aviso de saldo baixo (quando aplicável), histórico das últimas 50 utilizações (data/hora, link para o chat, tokens, créditos consumidos).
- **Acesso:** link "Uso e créditos" no menu do utilizador (sidebar); o saldo no header do chat é clicável e leva a esta página.

---

## 4. Administrador

### 4.1 Funções

- Ver lista de utilizadores com saldo atual (e opcionalmente uso no período).
- Atribuir ou alterar créditos a um utilizador (ex.: +100 créditos).
- Definir saldo inicial por tipo de utilizador (guest, regular) para novos utilizadores.
- Opcional: export de uso (CSV) por utilizador e período.

### 4.2 API admin

- **GET /api/admin/credits**  
  - Lista utilizadores com saldo (e opcionalmente totais de uso no mês).  
  - Protegido: apenas utilizadores com role admin ou chamada com secret (ex.: `x-admin-key`).

- **POST /api/admin/credits**  
  - Body: `{ userId: string, delta: number }` (delta positivo = adicionar créditos).  
  - Atualiza saldo e regista movimento (opcional: tabela de "transações" para auditoria).

- **GET /api/admin/usage**  
  - Query: `userId`, `from`, `to`.  
  - Devolve registos de uso (e totais) para dashboard/export.

Proteção admin: por agora, verificar header `x-admin-key` igual a `ADMIN_CREDITS_SECRET` (env). Futuro: roles no Auth (ex.: `user.type === 'admin'`).

---

## 5. Modelo de dados

### 5.1 Tabelas

- **UserCreditBalance**  
  - `userId` (PK, FK User)  
  - `balance` (integer, créditos)  
  - `updatedAt` (timestamp)

- **LlmUsageRecord**  
  - `id` (UUID, PK)  
  - `userId` (FK User)  
  - `chatId` (FK Chat, opcional)  
  - `promptTokens`, `completionTokens` (integer)  
  - `model` (varchar, opcional)  
  - `creditsConsumed` (integer)  
  - `createdAt` (timestamp)

Criação de linha em `UserCreditBalance` no primeiro uso ou ao atribuir créditos (upsert). Novos utilizadores: ao criar conta/guest, inserir com saldo inicial conforme tipo.

### 5.2 Conversão tokens → créditos

- `creditsConsumed = ceil((promptTokens + completionTokens) / 1000)`  
- Constante `CREDITS_PER_1000_TOKENS = 1` (ou configurável).

---

## 6. Fluxo técnico (chat)

1. **Antes de iniciar o stream**  
   - Ler saldo do utilizador.  
   - (Opcional) Estimar créditos para este pedido (ex.: 1 crédito mínimo).  
   - Se `balance < 1` (ou estimativa mínima): responder 402 ou 400 com mensagem "Sem créditos suficientes".

2. **Durante o stream**  
   - Manter referência ao resultado de `streamText()` para poder aceder a `totalUsage` no fim.

3. **onFinish**  
   - Obter `totalUsage` do resultado do `streamText` (await `result.totalUsage`).  
   - Calcular `creditsConsumed`.  
   - Inserir linha em `LlmUsageRecord`.  
   - Atualizar `UserCreditBalance`: `balance = balance - creditsConsumed`.  
   - (Opcional) Enviar ao cliente o consumo desta resposta via stream já terminado: não é possível; em alternativa, o cliente chama `GET /api/credits` após cada resposta para atualizar saldo e mostrar "último consumo" se a API devolver o último registo.

---

## 7. Integração com entitlements atuais

- **Entitlements** (`lib/ai/entitlements.ts`) hoje: limite de mensagens por dia (guest 50, regular 150).  
- **Créditos**: limite por saldo (total acumulado), não por dia.  
- Podem coexistir: primeiro verificar entitlement (mensagens/dia); depois verificar saldo de créditos.  
- Se quiser simplificar: pode remover o limite por mensagens/dia e usar apenas créditos; ou manter os dois (ex.: guest max 50 msgs/dia e ainda ter de ter créditos).

---

## 8. Resumo para implementação

| Item                         | Acção |
|-----------------------------|--------|
| Schema                      | Criar `UserCreditBalance`, `LlmUsageRecord`; migration. |
| Saldo inicial               | Ao criar user/guest, inserir balance consoante tipo. |
| Chat route                  | Verificar saldo antes do stream; em onFinish obter totalUsage, gravar uso e deduzir saldo. |
| GET /api/credits            | Retornar balance + recentUsage. |
| UI: saldo e avisos          | Header/sidebar com saldo; aviso se baixo; desativar envio se 0. |
| GET/POST /api/admin/credits | Listar users + saldo; adicionar créditos (delta). |
| Proteção admin              | Header `x-admin-key` = env `ADMIN_CREDITS_SECRET`. |

Documento de referência para implementação e evolução do modelo de créditos por consumo de LLM.
