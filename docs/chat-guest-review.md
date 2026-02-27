# Revisão do módulo /chat com acesso guest

Revisão do fluxo de visitante (guest) no módulo de chat, alinhada ao contexto do Revisor de Defesas e às regras do projeto (Ultracite, AGENTS.md).

---

## Resumo

O acesso guest está **bem integrado**: utilizadores não autenticados podem continuar como visitante a partir do **GuestGate** em `/chat`, obtêm sessão via `/api/auth/guest`, e usam o chat com as mesmas APIs que utilizadores regulares, com limites distintos (entitlements). As correções feitas foram de consistência de tipos e de códigos de erro.

---

## Fluxo atual

1. **Proxy** (`proxy.ts`): Para `/chat` e `/chat/*` **não** redireciona quando não há token; deixa a página decidir (evita loop).
2. **`/chat`** (`app/(chat)/chat/page.tsx`): Se `!session` → mostra **GuestGate** (continuar como visitante | iniciar sessão).
3. **GuestGate** (`guest-gate.tsx`): Link para `/api/auth/guest?redirectUrl=/chat` ou `/login`.
4. **`/api/auth/guest`**: Cria sessão guest (Auth.js provider `guest` → `createGuestUser()` na DB) e redireciona para `redirectUrl`.
5. **Layout (chat)** (`app/(chat)/layout.tsx`): Se `session?.user?.type === "guest"` → mostra **GuestBanner** (convite a criar conta).
6. **APIs**: Todas as rotas de chat/history/knowledge/document/files usam `auth()`; qualquer sessão (guest ou regular) tem `session.user.id` e `session.user.type`, e são tratadas de forma uniforme, com limites por tipo em `lib/ai/entitlements.ts` (guest: 20 msg/dia, regular: 50).

---

## Pontos verificados

| Área | Estado | Notas |
|------|--------|--------|
| **GuestGate** | OK | Mensagem e links acessíveis; redirecionamento correto. |
| **Layout e GuestBanner** | OK | Banner só para guest; texto claro (“Crie uma conta para guardar o histórico”). |
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

## Recomendações (opcional)

- **UX**: No GuestGate, considerar adicionar um título (e.g. `<h1>`) para acessibilidade e SEO, por exemplo “Chat” ou “Revisor de Defesas”.
- **Testes**: Garantir um E2E que: abre `/chat` sem sessão → vê GuestGate → clica “Continuar como visitante” → é redirecionado para `/chat` com sessão guest e vê o chat + GuestBanner.
- **Docs**: Manter `AGENTS.md` e `.env.example` a mencionar que o chat está acessível em modo visitante e que `POSTGRES_URL` e `AUTH_SECRET` são necessários para o guest.

---

## Ficheiros relevantes

- `app/(chat)/chat/page.tsx` — entrada do chat; GuestGate quando sem sessão.
- `app/(chat)/chat/guest-gate.tsx` — UI “continuar como visitante” / “iniciar sessão”.
- `app/(chat)/layout.tsx` — GuestBanner para guest.
- `app/(auth)/api/auth/guest/route.ts` — criação de sessão guest.
- `app/(auth)/auth.ts` — providers credentials e guest; tipo `UserType`.
- `app/(chat)/api/chat/route.ts` — handler do chat; usa `entitlementsByUserType[session.user.type]`.
- `lib/ai/entitlements.ts` — limites por tipo (guest / regular).
- `lib/db/queries.ts` — `createGuestUser()`.
- `proxy.ts` — regras para `/chat` sem token e redirect para guest.
- `components/guest-banner.tsx`, `components/sidebar-user-nav.tsx` — UI para guest.
