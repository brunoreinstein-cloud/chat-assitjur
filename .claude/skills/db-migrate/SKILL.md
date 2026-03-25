---
name: db-migrate
description: Gera e aplica migrações Drizzle ORM com verificação de segurança. Use antes de commitar mudanças de schema ou ao receber novas migrações do repositório.
disable-model-invocation: true
allowed-tools: Bash(pnpm *), Bash(ls *), Read
---

Execute o fluxo completo de migração do banco de dados AssistJur (Drizzle ORM + PostgreSQL).

## Argumento opcional
$ARGUMENTS (ex: `generate` para apenas gerar, `apply` para apenas aplicar, vazio = fluxo completo)

## Fluxo completo (padrão)

### 1. Verificar pré-condições
```bash
# Checar se POSTGRES_URL está configurada
grep -q POSTGRES_URL .env.local && echo "OK" || echo "FALTA POSTGRES_URL em .env.local"
```
Se `POSTGRES_URL` não existir, **abortar e avisar o usuário**.

### 2. Verificar estado do schema
```bash
# Ver arquivos de migração pendentes (não aplicados)
ls lib/db/migrations/*.sql | tail -5
```
Listar migrações existentes e verificar se há arquivos novos desde o último deploy.

### 3. Verificar consistência das migrações
```bash
pnpm run db:check
```
Se falhar, reportar o erro e **não continuar** sem confirmação do usuário.

### 4. Gerar nova migração (se houver mudanças no schema)
Só executar se `$ARGUMENTS` for `generate` ou se o usuário modificou `lib/db/schema.ts`:
```bash
pnpm run db:generate
```
Após gerar, mostrar ao usuário quais arquivos foram criados.

### 5. Aplicar migrações
```bash
pnpm run db:migrate
```
Observar a saída — se houver erro de conexão, checar `POSTGRES_URL`.

### 6. Verificar resultado
```bash
pnpm run db:ping
```
Confirmar que o banco responde após a migração.

### 7. Resumo final
Reportar:
- Quantas migrações foram aplicadas
- Se houve erros
- Próximos passos recomendados (ex: commitar os arquivos `.sql` gerados)

## Avisos importantes
- **Nunca** usar `pnpm run db:push` — o projeto desabilitou esse comando por bugs com colunas sem default
- Migrações geradas devem ser commitadas junto com as mudanças de schema
- Em produção, as migrações rodam automaticamente via `pnpm run build`
