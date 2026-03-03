# Text Editor Tool da Anthropic no AI SDK

A [Text Editor Tool](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/text-editor-tool) da Anthropic permite que o Claude veja e edite ficheiros de texto (comandos `view`, `str_replace`, `create`, `insert` e, em modelos antigos, `undo_edit`). No Vercel AI SDK esta ferramenta é um **provider-defined tool**: o schema é definido pela Anthropic e tu implementas a função `execute`.

## Pré-requisitos

- Usar o **provider Anthropic** (`@ai-sdk/anthropic`), não o AI Gateway, quando quiseres esta tool. O projeto atual usa `@ai-sdk/gateway` para o chat; para ativar o text editor é preciso usar o modelo via `@ai-sdk/anthropic` nessa flow (ou numa rota/agente dedicado).
- Instalar o provider: `pnpm add @ai-sdk/anthropic`

## Uso com `streamText` / `generateText`

```ts
import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";

// Para Claude 4 (Sonnet 4, Opus 4, Opus 4.1) — recomendado
const tools = {
  str_replace_based_edit_tool: anthropic.tools.textEditor_20250728({
    maxCharacters: 10_000, // opcional: trunca ficheiros grandes no view
    async execute({ command, path, old_str, new_str, insert_text, insert_line, file_text, view_range }) {
      switch (command) {
        case "view": {
          // path: ficheiro ou diretório
          // view_range: [início, fim] opcional (linhas 1-indexed; -1 = até ao fim)
          const content = await readFileOrDir(path, view_range);
          return content;
        }
        case "str_replace": {
          // old_str → new_str em path
          const result = await replaceInFile(path, old_str ?? "", new_str ?? "");
          return result; // ex.: "Successfully replaced text at exactly one location."
        }
        case "create": {
          await writeFile(path, file_text ?? "");
          return "File created.";
        }
        case "insert": {
          // insert_line: linha após a qual inserir (0 = início do ficheiro)
          await insertAtLine(path, insert_line ?? 0, insert_text ?? "");
          return "Text inserted.";
        }
        default:
          return "Error: Unknown command.";
      }
    },
  }),
};

const result = streamText({
  model: anthropic("claude-sonnet-4-20250514"),
  messages,
  tools,
});
```

## Versões da tool por modelo

| Versão | Modelos |
|--------|--------|
| `textEditor_20250728` | Claude Sonnet 4, Opus 4, Opus 4.1 (recomendado) |
| `textEditor_20250124` | Claude Sonnet 3.7 |
| `textEditor_20241022` | Claude Sonnet 3.5 |

Nota: `textEditor_20250728` não inclui o comando `undo_edit`. O parâmetro `maxCharacters` só existe nesta versão.

## Integração no chat deste projeto

O chat em `app/(chat)/api/chat/route.ts` usa `getLanguageModel(effectiveModel)` via **AI Gateway**. O Gateway não expõe provider-defined tools do Anthropic. Para usar a Text Editor Tool tens duas opções:

1. **Rota ou agente dedicado com Anthropic direto**  
   Numa rota separada (ex.: `/api/chat-with-editor`) ou quando um agente específico estiver ativo:
   - Usar `anthropic(modelId)` em vez de `gateway.languageModel(modelId)`.
   - Adicionar `anthropic.tools.textEditor_20250728({ execute })` ao objeto `tools` do `streamText`.
   - Implementar `execute` com validação de paths (evitar directory traversal), preferencialmente com sandbox (ex.: só ficheiros dentro de um diretório permitido).

2. **Manter Gateway e não usar Text Editor**  
   Enquanto usares só o Gateway, esta tool não está disponível; terias de mudar para o provider Anthropic nessa flow.

## Segurança

- **Validação de paths**: normalizar e restringir a um diretório base (ex.: workspace do projeto) para evitar acesso a ficheiros sensíveis.
- **Backup**: fazer cópia do ficheiro antes de `str_replace` ou `insert` se for crítico.
- **Replace único**: no `str_replace`, garantir que `old_str` corresponde a uma única ocorrência; caso contrário, devolver erro e não alterar (como na doc da Anthropic).
- **Permissões**: a função `execute` corre no servidor; garantir que apenas utilizadores autorizados podem invocar esta flow.

## Referências

- [Anthropic – Text editor tool](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/text-editor-tool)
- [AI SDK – Anthropic provider](https://sdk.vercel.ai/providers/ai-sdk-providers/anthropic) (secção "Text Editor Tool")
- [AI SDK – Tools](https://sdk.vercel.ai/docs/foundations/tools)
