# Memory Tools — Memória Persistente entre Sessões

Os agentes com `useMemoryTools: true` podem guardar e recuperar informação entre conversas através de três ferramentas: `saveMemory`, `recallMemories` e `forgetMemory`.

---

## Agentes com memória ativa

| Agente | `useMemoryTools` |
|--------|:----------------:|
| Assistente Geral | ✅ |
| Revisor de Defesas | ✅ |
| Redator de Contestações | ✅ |
| Avaliador de Contestação | ✅ |
| AssistJur.IA Master | ✅ |

Todos os agentes built-in têm memória ativa por omissão.

---

## Como usar (perspetiva do utilizador)

O agente guarda e consulta memórias **automaticamente** quando relevante. Também pode ser instruído explicitamente:

**Guardar:**
> "Lembra-te que o escritório usa sempre o formato de petição da Súmula 37."
> "Guarda que o cliente João Silva trabalhou das 7h às 19h."

**Recuperar:**
> "O que sabes sobre o cliente João Silva?"
> "Que preferências de formato tens guardadas para mim?"

**Apagar:**
> "Esquece as informações sobre o processo 1234."
> "Remove a memória sobre o horário do João Silva."

O agente chama `recallMemories` ao iniciar conversas para ter contexto de sessões anteriores.

---

## As três ferramentas

### `saveMemory`
Guarda (ou atualiza) um par chave-valor na memória persistente do utilizador.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `key` | string (max 128) | Chave única em snake_case. Ex: `cliente_nome`, `processo_1234_admissao` |
| `value` | string | Texto livre ou JSON serializado |

**Exemplos de chaves:**
```
cliente_joao_horario       → "7h às 19h, segunda a sexta"
preferencia_formato_petica → "cabeçalho com número CNJ em negrito"
processo_1234_risco        → "possível; principal risco: horas extras"
escritorio_modelo_contrato → "cláusula 12 é padrão"
```

### `recallMemories`
Recupera todas as memórias ativas do utilizador. Sem parâmetros.

Retorna: lista de `{ key, value, updatedAt }` + contagem total.

### `forgetMemory`
Apaga uma memória pela chave exata.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `key` | string | Chave exata da memória a apagar |

---

## Limites

| Parâmetro | Valor |
|-----------|-------|
| Chave máxima | 128 caracteres |
| Valor | texto livre (sem limite definido na tool) |
| Âmbito | por `userId` — sem acesso entre utilizadores |
| Persistência | BD (tabela `UserMemory`) — persiste entre sessões e dispositivos |

---

## Referência técnica

| Componente | Ficheiro |
|------------|---------|
| Tool implementation | `lib/ai/tools/memory.ts` |
| Queries BD | `lib/db/queries.ts` — `saveUserMemory`, `listUserMemories`, `deleteUserMemory` |
| Tabela | `UserMemory` (id, userId, key, value, updatedAt) |
| Flag no registry | `useMemoryTools: true` em `lib/ai/agents-registry.ts` |
