# Revisão do módulo /chat com acesso guest

Revisão do fluxo de visitante (guest) no módulo de chat, alinhada ao contexto do Revisor de Defesas e às regras do projeto (Ultracite, AGENTS.md).

**Última atualização:** 2025-03-01

---

## Resumo

O acesso guest está **bem integrado**: utilizadores não autenticados podem continuar como visitante a partir do **GuestGate** em `/chat`, obtêm sessão via **server action** `signInAsGuest` (ou, a partir da página de login, via `POST /api/auth/guest`), e usam o chat com as mesmas APIs que utilizadores regulares, com limites distintos (entitlements). As correções feitas foram de consistência de tipos e de códigos de erro.

---

## Fluxo atual

1. **Proxy** (`proxy.ts`): Para `/chat` e `/chat/*` **não** redireciona quando não há token; deixa a página decidir (evita loop).
2. **`/chat`** (`app/(chat)/chat/page.tsx`): Se `!session` → mostra **GuestGate** (continuar como visitante | iniciar sessão).
3. **GuestGate** (`guest-gate.tsx`): **Form** com `action={signInAsGuest}` (server action em `app/(chat)/actions.ts`) que chama `signIn("guest", { redirectTo: "/chat" })`; link para `/login`. Alternativa: na página de login existe link para `GET /api/auth/guest?redirectUrl=/chat`, que devolve HTML com form POST para a mesma rota.
4. **Sessão guest**: Auth.js provider `guest` → `createGuestUser()` na DB; `session.user.type === "guest"`. A rota `POST /api/auth/guest` (em `app/(auth)/api/auth/guest/route.ts`) também cria sessão e redireciona para `redirectUrl`.
5. **Layout (chat)** (`app/(chat)/layout.tsx`): Se `session?.user?.type === "guest"` → mostra **GuestBanner** (convite a criar conta).
6. **APIs**: Todas as rotas de chat/history/knowledge/document/files usam `auth()`; qualquer sessão (guest ou regular) tem `session.user.id` e `session.user.type`, e são tratadas de forma uniforme, com limites por tipo em `lib/ai/entitlements.ts` (guest: 20 msg/dia, regular: 50).

---

## Pontos verificados

| Área | Estado | Notas |
|------|--------|--------|
| **GuestGate** | OK | Mensagem e links acessíveis; redirecionamento correto. |
| **Layout e GuestBanner** | OK | Banner só para guest; texto: “Está a usar como visitante…”; CTA “Crie uma conta para guardar o histórico”. |
| **POST /api/chat** | OK | Usa `session.user.id` e `session.user.type`; rate limit via `entitlementsByUserType[userType]`. |
| **GET/DELETE /api/chat** | OK | Exige sessão; ownership por `session.user.id`. |
| **/api/history** | OK | Exige `session?.user?.id`; guest vê apenas os seus chats. |
| **/api/knowledge** | OK | Exige sessão; documentos por `session.user.id`. |
| **/api/document** | OK | Exige sessão; ownership por `session.user.id`. Corrigido: POST sem sessão devolve `unauthorized:document`. |
| **/api/files/upload** | OK | Exige sessão; upload associado ao utilizador. |
| **Página /chat/[id]** | OK | Sem sessão → `redirect("/chat")`; com sessão, acesso só ao próprio chat (private). |
| **Proxy** | OK | `/chat` e `/chat/*` sem token → `next()`; outras rotas protegidas → redirect para guest com `redirectUrl`. |
| **Auth guest** | OK | Provider `guest` cria utilizador na DB (`guest-${Date.now()}`); `session.user.type === "guest"`. |
| **Entitlements** | OK | `guest` e `regular` definidos; tipo usado em `/api/chat` para limite diário. |
| **Sidebar** | OK | Guest vê “Reiniciar como visitante” e “Entrar na sua conta”; `guestRegex` para detetar guest por email. |

---

## Correções aplicadas

1. **`app/(auth)/auth.ts`**  
   - Removido `any` no `authorize` do provider de credenciais: parâmetro tipado como `{ email?: string; password?: string }`.  
   - Adicionado guard `if (!email) return null` antes de `getUser(email)` (evita passar `undefined`).

2. **`app/(chat)/api/document/route.ts`**  
   - No POST, quando `!session?.user` a resposta passou de `not_found:document` para `unauthorized:document`, alinhada ao GET e ao resto das APIs.

---

## Limites numéricos (entitlements)

| Tipo    | Mensagens/dia |
|---------|----------------|
| `guest` | 20             |
| `regular` | 50           |

Definidos em `lib/ai/entitlements.ts`; utilizados em `POST /api/chat` para rate limit diário. Futuro: tipo para conta paga (comentário TODO no código).

---

## Segurança e ambiente

- **Guest** não acede a dados de outros utilizadores: ownership por `session.user.id` em todas as APIs de chat/history/knowledge/document/files.
- **Proxy**: rotas fora de `/chat` e `/api/auth` sem token → redirect para página de guest com `redirectUrl` (não expõe APIs sensíveis sem sessão).
- **Sessão guest** exige `AUTH_SECRET` e `POSTGRES_URL`; a rota `POST /api/auth/guest` devolve 503 se alguma faltar (ver `checkEnv()` em `app/(auth)/api/auth/guest/route.ts`).

---

## Recomendações (opcional)

- **UX / a11y**: No GuestGate, adicionar um título (e.g. `<h1>`) para acessibilidade e SEO, por exemplo “Chat” ou “Revisor de Defesas”. Garantir que o botão “Continuar como visitante” tenha contexto semântico (evitar só “Submeter” para leitores de ecrã).
- **Testes**: Garantir um E2E que: abre `/chat` sem sessão → vê GuestGate → clica “Continuar como visitante” → é redirecionado para `/chat` com sessão guest e vê o chat + GuestBanner.
- **Docs**: Em `AGENTS.md`, na secção “Funcionalidades principais” ou “Visão geral”, mencionar explicitamente que o chat está acessível em **modo visitante** (guest). O `.env.example` já referencia guest e a necessidade de `POSTGRES_URL` e `AUTH_SECRET` para o fluxo guest.

---

## Referências cruzadas

- [AGENTS.md](../AGENTS.md) — regras e convenções do projeto.
- [docs/PROJETO-REVISOR-DEFESAS.md](PROJETO-REVISOR-DEFESAS.md) — documentação do Revisor de Defesas (fluxo do agente, não do guest).
- [.agents/skills/revisor-defesas-context](../.agents/skills/revisor-defesas-context/SKILL.md) — checklist ao alterar prompts ou fluxo do revisor.

---

## Ficheiros relevantes

- `app/(chat)/chat/page.tsx` — entrada do chat; GuestGate quando sem sessão.
- `app/(chat)/chat/guest-gate.tsx` — UI “continuar como visitante” / “iniciar sessão”.
- `app/(chat)/actions.ts` — server action `signInAsGuest()` usada pelo GuestGate.
- `app/(chat)/layout.tsx` — GuestBanner para guest.
- `app/(auth)/api/auth/guest/route.ts` — GET (form HTML) e POST (criação de sessão guest e redirect).
- `app/(auth)/auth.ts` — providers credentials e guest; tipo `UserType`.
- `app/(chat)/api/chat/route.ts` — handler do chat; usa `entitlementsByUserType[session.user.type]`.
- `lib/ai/entitlements.ts` — limites por tipo (guest / regular).
- `lib/db/queries.ts` — `createGuestUser()`.
- `proxy.ts` — regras para `/chat` sem token e redirect para guest.
- `components/guest-banner.tsx`, `components/sidebar-user-nav.tsx` — UI para guest.
