# Design System — AssistJur

**Conceito:** Legal Intelligence Platform — Workspace de Contencioso
**Stack:** Tailwind CSS v4 · shadcn/ui · CSS Custom Properties · Inter + JetBrains Mono
**Versao:** 3.0

---

## Indice

1. [Diagnostico e Evolucao](#1-diagnostico-e-evolucao)
2. [Direcao Estetica](#2-direcao-estetica)
3. [Anti-padroes — O que NAO fazer](#3-anti-padroes--o-que-nao-fazer)
4. [Paleta de Cores](#4-paleta-de-cores)
5. [Tokens Semanticos](#5-tokens-semanticos)
6. [Tipografia](#6-tipografia)
7. [Voz e Linguagem](#7-voz-e-linguagem)
8. [Espacamento](#8-espacamento)
9. [Border Radius](#9-border-radius)
10. [Sombras / Elevacao](#10-sombras--elevacao)
11. [Layout System](#11-layout-system)
12. [Componentes Primitivos](#12-componentes-primitivos)
13. [Componentes Compostos](#13-componentes-compostos)
14. [Padroes de Rastreabilidade](#14-padroes-de-rastreabilidade)
15. [Estados de Interacao](#15-estados-de-interacao)
16. [Dark / Light Mode](#16-dark--light-mode)
17. [Iconografia](#17-iconografia)
18. [Motion e Animacao](#18-motion-e-animacao)
19. [Responsividade](#19-responsividade)
20. [Guidelines de Consistencia](#20-guidelines-de-consistencia)
21. [Escalar o Produto](#21-escalar-o-produto)

---

## 1. Diagnostico e Evolucao

### v1.0 > v2.0 (revisao anterior)

A v2.0 corrigiu problemas fundamentais: tokens de marca isolados, falta de identidade no dark mode, ausencia de componentes compostos e sistema de confianca. Trouxe a paleta completa, layout AppShell formal, split-view e padroes de rastreabilidade.

### v2.0 > v3.0 (esta revisao)

| Area | Problema na v2.0 | Correcao na v3.0 |
|---|---|---|
| **Estetica** | Produto ainda carregava tracos de "feito por IA" — excesso de badges coloridos, icone Sparkles, linguagem tech | Direcao visual mais restrita, institucional. Menos decoracao, mais tipografia e espaco |
| **Tipografia** | Geist e valido mas associado a ecossistema Vercel/AI | Inter (corpo) + JetBrains Mono (dados). Neutra, legivel, sem associacao com stack de IA |
| **Iconografia** | Sparkles como indicador de IA. Bot como avatar. Excesso de icones decorativos | Icones utilitarios apenas. IA nao precisa de icone proprio — o produto inteiro e IA |
| **Tom visual** | Sombras com glow roxo, badges gold chamativos | Sombras neutras, gold reservado a 1 elemento por tela no maximo |
| **Linguagem** | Misturava jargao de IA ("agente", "inferencia") com termos juridicos | Linguagem 100% juridica voltada ao usuario. IA e infraestrutura, nao feature |
| **Densidade** | Cards de agente e fluxo competiam visualmente | Hierarquia mais clara: FlowCards sao primarios, AgentCards sao infraestrutura |
| **Anti-padroes** | Nao documentados | Secao dedicada com exemplos concretos do que evitar |

---

## 2. Direcao Estetica

### Conceito: "Plataforma de trabalho juridico"

O AssistJur deve transmitir a mesma sensacao que uma mesa de trabalho bem organizada: tudo no lugar, sem excesso, cada elemento com funcao clara. O advogado abre o sistema e sabe exatamente onde esta e o que fazer.

**Posicionamento visual:** O produto que um escritorio de advocacia de alto nivel escolheria. Nao por ser bonito, mas por ser serio, rapido e confiavel.

**Referencias de produto:**

| Referencia | O que absorver |
|---|---|
| **Linear** | Clareza tipografica, hierarquia por densidade, nada de excesso |
| **Notion** | Conforto de uso diario, espaco generoso, composicao limpa |
| **Superhuman** | Velocidade percebida, atalhos de teclado, foco no poder do usuario |
| **Bloomberg Terminal** | Densidade informacional com ordem, seriedade institucional |
| **Claude.ai** | Simplicidade que transmite competencia, interface que sai do caminho |

**Anti-referencias:**

| Anti-referencia | O que evitar |
|---|---|
| Salesforce | Peso visual, excesso de chrome, menus em cascata |
| ChatGPT / produtos de "AI chat" | Estetica de chat generico, icone de centelha, gradientes roxos |
| LegalZoom | Corporativo-generico sem personalidade |
| Lexis Nexis / sistemas juridicos legados | Interface datada, sobrecarga de menus |
| Landing pages de startups de IA | Gradientes neon, animacoes de particulas, linguagem hype |

### Principios de Design

1. **Tipografia como hierarquia principal.** Peso, tamanho e espacamento fazem o trabalho pesado. Cor e decoracao sao secundarios.

2. **Interface que desaparece.** O produto ideal e aquele onde o advogado esquece que esta usando software. Nenhum elemento deve chamar atencao para si mesmo — so para o conteudo.

3. **Marca presente, nao gritante.** O roxo AssistJur aparece em pontos de interacao (focus ring, item ativo, CTA primario), nao como decoracao de fundo.

4. **Densidade confortavel.** Contexto juridico exige leitura longa e atencao a detalhes. Espacamento generoso, leading 1.6, largura de linha controlada (max 72ch para texto corrido).

5. **Zero ambiguidade de estado.** Focus rings visiveis, hover explicito, disabled claro, loading com skeleton. O usuario nunca deve perguntar "isso esta funcionando?".

6. **Caso como unidade de trabalho.** Toda navegacao dentro do workspace mostra o contexto do caso no header. O chat e ferramenta dentro do caso, nao entidade independente.

7. **Rastreabilidade e parte da interface.** Origem das informacoes, documentos consultados e indicadores de revisao sao componentes visiveis. Confianca nao e marketing — e funcionalidade.

8. **Orientacao em vez de escolha.** Sugerir o proximo passo com base no contexto, em vez de expor catalogo de opcoes. O sistema sabe mais que o usuario sobre o que vem depois.

9. **Sem estetica de IA.** O produto nao precisa lembrar o usuario que usa inteligencia artificial. IA e a infraestrutura — como eletricidade. Nao colocamos icone de raio em cada interruptor.

---

## 3. Anti-padroes — O que NAO fazer

Esta secao existe para evitar que o produto caia em cliches de "produto de IA". Cada item e um padrao real visto no mercado que deve ser ativamente evitado.

### Visual

| Padrao a evitar | Porque | Alternativa |
|---|---|---|
| Icone de centelha/estrela (Sparkles) para indicar IA | Cliche universal de produto AI. Reduz percecao de seriedade | IA nao precisa de icone. O produto inteiro e IA |
| Gradiente roxo-para-azul em backgrounds | Associacao direta com landing pages de IA | Cores solidas, backgrounds neutros com tint sutil |
| Icone de robo/bot como avatar de assistente | Infantiliza o produto | Usar marca do AssistJur ou icone neutro do dominio (ex: Scale) |
| Animacao de "digitando..." com bolinhas pulsantes | Padrao de chatbot generico | Skeleton loading no formato do conteudo esperado, ou indicador de progresso com contexto ("Analisando 4 documentos...") |
| Halo/glow roxo em botoes e sombras | Over-branding, estetica sci-fi | Sombras neutras com leve warmth |
| Palavra "magica" ou "magia" em qualquer lugar | Reduz confianca do publico juridico | Descrever a funcao: "analisa", "extrai", "redige", "identifica" |
| Badge "IA" ou "AI-powered" em componentes | O produto inteiro e IA — redundante | Nao rotular. A inteligencia esta embutida |
| Animacao de particulas, orbs, nebulosas | Estetica de demo, nao de ferramenta de trabalho | Estatico, limpo, funcional |
| Excesso de emojis em interface ou copy | Informalidade incompativel com contexto juridico | Sem emojis na interface de produto. Icones Lucide quando necessario |
| Texto "Powered by Claude/GPT/LLM" na interface | Expoe infraestrutura ao usuario final | O advogado nao precisa saber qual modelo roda por baixo |

### Linguagem

| Padrao a evitar | Alternativa |
|---|---|
| "Agente de IA" | "Assistente" ou nome do fluxo ("Revisor de Defesas") |
| "Inferencia" (para o usuario) | "Sugestao do sistema" ou "Ponto que requer revisao" |
| "Prompt" | "Instrucao" ou "Descricao do caso" |
| "Modelo" (no sentido de LLM) | Nao expor. Se necessario, "configuracao do assistente" |
| "Tokens", "contexto", "embedding" | Nunca expor termos tecnicos de IA ao usuario |
| "Gerar" (como acao principal) | "Redigir", "Elaborar", "Preparar", "Criar" |
| "Output" | "Resultado", "Documento", "Peca", "Analise" |

### Interacao

| Padrao a evitar | Alternativa |
|---|---|
| Tela inicial com campo de chat vazio | Home com casos, fluxos e acoes claras |
| Upload sem feedback de proximo passo | Upload sempre seguido de sugestoes contextuais |
| Lista de agentes sem contexto de uso | Fluxos nomeados por tarefa com input/output claros |
| Chat como unica interface de interacao | Chat e um dos modos. Formularios guiados, editor de documento e timeline sao igualmente importantes |

---

## 4. Paleta de Cores

### Purple — Cor de Marca

Usada em pontos de interacao e identidade, nao como decoracao de superficie.

| Token CSS | Valor | Uso |
|---|---|---|
| `--assistjur-purple-50` | `#f5f3ff` | Background de destaque suave (hover de lista) |
| `--assistjur-purple-100` | `#ede9fe` | Badge de marca (light), chip de categoria |
| `--assistjur-purple-200` | `#ddd6fe` | Border decorativa sutil |
| `--assistjur-purple-400` | `#a78bfa` | Icones secundarios, placeholder ativo |
| **`--assistjur-purple-600`** | **`#7c3aed`** | **Brand primary — botoes, links, item ativo, focus ring** |
| `--assistjur-purple-700` | `#6d28d9` | Hover sobre primary |
| `--assistjur-purple-800` | `#5b21b6` | Texto sobre fundo purple claro |
| `--assistjur-purple-900` | `#4c1d95` | Dark backgrounds decorativos |
| **`--assistjur-purple-950`** | **`#2e1065`** | **Auth layout, backgrounds de destaque escuro** |

### Gold — Acento restrito

Regra fundamental: maximo 1 elemento gold por viewport. Nunca em areas grandes.

| Token CSS | Valor | Uso |
|---|---|---|
| `--assistjur-gold-400` | `#facc15` | Icones de destaque pontual |
| **`--assistjur-gold-500`** | **`#eab308`** | **CTA premium unico — ex: "Assinar plano"** |
| `--assistjur-gold-600` | `#ca8a04` | Hover em elementos gold |
| `--assistjur-gold-700` | `#a16207` | Texto sobre fundo gold |

### Neutral (warm undertone)

Escala de `--assistjur-neutral-50` a `--assistjur-neutral-950`.
Tons com undertone levemente quente (nao zinc puro, nao lilac forcado) para manter coerencia sem artificialidade.

| Token | Valor | Uso |
|---|---|---|
| `--assistjur-neutral-50` | `#fafaf9` | Background mais claro |
| `--assistjur-neutral-100` | `#f5f5f4` | Superficie elevada sutil |
| `--assistjur-neutral-200` | `#e7e5e4` | Borders leves |
| `--assistjur-neutral-300` | `#d6d3d1` | Borders de input |
| `--assistjur-neutral-400` | `#a8a29e` | Placeholder text |
| `--assistjur-neutral-500` | `#78716c` | Texto terciario |
| `--assistjur-neutral-600` | `#57534e` | Texto secundario |
| `--assistjur-neutral-700` | `#44403c` | Texto secundario forte |
| `--assistjur-neutral-800` | `#292524` | Texto primario (dark mode) |
| `--assistjur-neutral-900` | `#1c1917` | Background escuro |
| `--assistjur-neutral-950` | `#0c0a09` | Background mais escuro |

### Status

Cores de status seguem convencoes universais. Sem personalizacao.

| Uso | Foreground | Background |
|---|---|---|
| Sucesso | `#16a34a` | `#f0fdf4` |
| Alerta | `#d97706` | `#fffbeb` |
| Erro | `#dc2626` | `#fef2f2` |
| Info | `#2563eb` | `#eff6ff` |

### Workflow — Status Processual

Cores dedicadas para estados do fluxo de trabalho no caso.

| Token CSS | Valor | Uso |
|---|---|---|
| `--workflow-draft` | `hsl(220 12% 55%)` | Rascunho / em construcao |
| `--workflow-draft-bg` | `hsl(220 14% 96%)` | Background de rascunho |
| `--workflow-active` | `hsl(262 83% 57%)` | Em andamento (= brand purple) |
| `--workflow-active-bg` | `hsl(262 30% 96%)` | Background ativo |
| `--workflow-review` | `hsl(38 92% 50%)` | Aguardando revisao humana |
| `--workflow-review-bg` | `hsl(48 96% 96%)` | Background de revisao |
| `--workflow-done` | `hsl(142 71% 36%)` | Concluido / aprovado |
| `--workflow-done-bg` | `hsl(142 76% 96%)` | Background concluido |
| `--workflow-blocked` | `hsl(0 72% 50%)` | Bloqueado / pendencia critica |
| `--workflow-blocked-bg` | `hsl(0 72% 96%)` | Background bloqueado |

### Rastreabilidade — Origem de Informacao

Cores para o sistema de fontes e evidencias. Nomenclatura voltada ao advogado, nao ao engenheiro.

| Token CSS | Valor | Uso | Label para o usuario |
|---|---|---|---|
| `--source-document` | `hsl(210 85% 53%)` | Extraido de documento | "Fonte: [nome do doc]" |
| `--source-document-bg` | `hsl(210 85% 96%)` | Background de citacao | — |
| `--source-suggested` | `hsl(38 80% 52%)` | Sugestao do sistema (requer conferencia) | "Sugestao — verificar" |
| `--source-suggested-bg` | `hsl(48 90% 96%)` | Background de sugestao | — |
| `--source-review` | `hsl(0 72% 50%)` | Requer revisao humana obrigatoria | "Revisao necessaria" |
| `--source-review-bg` | `hsl(0 72% 96%)` | Background de alerta | — |
| `--source-verified` | `hsl(142 71% 36%)` | Revisado e aprovado pelo advogado | "Verificado" |
| `--source-verified-bg` | `hsl(142 76% 96%)` | Background verificado | — |

Nota v3.0: Os tokens anteriores `--confidence-*` foram renomeados para `--source-*`. O termo "confianca" sugere que o sistema avalia a si mesmo — o que pode gerar desconfianca. "Fonte" e "origem" sao mais concretos e profissionais.

---

## 5. Tokens Semanticos

### Light Mode

| Token | Valor HSL | Decisao |
|---|---|---|
| `--background` | `hsl(0 0% 100%)` | Branco puro — maxima legibilidade |
| `--foreground` | `hsl(24 10% 10%)` | Near-black com warmth sutil |
| `--primary` | `hsl(262 83% 57%)` | Brand purple — nao preto generico |
| `--primary-foreground` | `hsl(0 0% 100%)` | Branco sobre roxo |
| `--secondary` | `hsl(30 6% 96%)` | Cinza quente muito suave |
| `--secondary-foreground` | `hsl(24 10% 25%)` | Texto escuro legivel |
| `--muted` | `hsl(30 6% 96%)` | Fundo de areas inativas |
| `--muted-foreground` | `hsl(24 6% 45%)` | Texto secundario |
| `--accent` | `hsl(30 6% 94%)` | Hover em ghost buttons |
| `--accent-foreground` | `hsl(24 10% 10%)` | Texto sobre accent |
| `--border` | `hsl(24 6% 90%)` | Borda padrao — neutra com warmth |
| `--input` | `hsl(24 6% 90%)` | Borda de inputs |
| `--ring` | `hsl(262 83% 57%)` | Focus ring = brand purple |
| `--sidebar-background` | `hsl(30 6% 97%)` | Sidebar com tint quente sutil |

Nota v3.0: Tokens secundarios, muted e accent usam tons neutros quentes em vez de lilac. O roxo fica reservado para interacao (primary, ring, item ativo), nao para superficies de fundo. Isso reduz a saturacao geral e aproxima o produto de ferramentas profissionais como Linear e Notion.

#### Tokens de Layout

| Token | Valor HSL | Decisao |
|---|---|---|
| `--surface-workspace` | `hsl(30 4% 98%)` | Background do workspace |
| `--surface-panel` | `hsl(0 0% 100%)` | Paineis flutuantes |
| `--surface-artifact` | `hsl(0 0% 100%)` | Fundo do editor de documento |
| `--surface-composer` | `hsl(0 0% 100%)` | Fundo do composer |
| `--surface-sidebar-active` | `hsl(262 30% 95%)` | Item ativo na sidebar (unico ponto de cor na sidebar) |
| `--border-subtle` | `hsl(24 5% 93%)` | Separadores entre paineis |
| `--border-split` | `hsl(24 6% 90%)` | Divisor do split-view |

### Dark Mode

| Token | Valor HSL | Decisao |
|---|---|---|
| `--background` | `hsl(256 20% 6%)` | Roxo profundo, nao preto puro |
| `--foreground` | `hsl(30 6% 90%)` | Near-white com warmth |
| `--card` | `hsl(256 18% 9%)` | Elevado sobre background |
| `--primary` | `hsl(262 70% 65%)` | Roxo claro para contraste sobre escuro |
| `--primary-foreground` | `hsl(0 0% 100%)` | Branco |
| `--secondary` | `hsl(256 12% 14%)` | Superficie elevada |
| `--secondary-foreground` | `hsl(30 6% 85%)` | Texto claro |
| `--muted` | `hsl(256 12% 14%)` | Areas inativas |
| `--muted-foreground` | `hsl(30 4% 55%)` | Texto secundario |
| `--border` | `hsl(256 16% 16%)` | Borda sutil |
| `--ring` | `hsl(262 70% 65%)` | Focus ring |
| `--sidebar-background` | `hsl(256 24% 4%)` | Mais escuro que bg — efeito recessed |

#### Tokens de Layout — Dark

| Token | Valor HSL | Decisao |
|---|---|---|
| `--surface-workspace` | `hsl(256 18% 7%)` | Background workspace |
| `--surface-panel` | `hsl(256 16% 10%)` | Paineis flutuantes |
| `--surface-artifact` | `hsl(256 14% 11%)` | Fundo do editor |
| `--surface-composer` | `hsl(256 16% 10%)` | Fundo do composer |
| `--surface-sidebar-active` | `hsl(262 24% 14%)` | Item ativo sidebar |
| `--border-subtle` | `hsl(256 14% 13%)` | Separadores |
| `--border-split` | `hsl(256 16% 16%)` | Divisor split-view |

---

## 6. Tipografia

### Fontes

| Familia | Uso | CSS Var | Justificativa |
|---|---|---|---|
| **Inter** | Texto de interface, corpo, titulos | `--font-sans` | Legibilidade excelente em todas as densidades. Neutra sem ser invisivel. Sem associacao com ecossistema de IA. Suporte completo a PT-BR. Variable font. |
| **JetBrains Mono** | Numeros de processo, timestamps, dados tecnicos, tabelas de valores | `--font-mono` | Mais legivel que Geist Mono em contexto de dados. Distingue claramente 0/O, 1/l/I — critico para numeros de processo. |

Nota v3.0: A mudanca de Geist para Inter e deliberada. Geist esta fortemente associada ao ecossistema Vercel/AI (v0, Claude artifacts, Next.js templates). Inter e uma escolha de engenharia tipografica, nao de stack.

Alternativa aceita: **IBM Plex Sans** como segunda opcao, caso se queira um carater mais institucional. Nunca usar: Arial, Roboto, system-ui generico, Space Grotesk, Geist.

### Escala de Tamanhos

```
xs   = 12px / 0.75rem  — labels, metadados, badges, timestamps
sm   = 14px / 0.875rem — body secundario, descricoes, tooltips
base = 16px / 1rem     — body principal, mensagens de chat, formularios
lg   = 18px / 1.125rem — body com enfase
xl   = 20px / 1.25rem  — subtitulo de secao, titulo de card
2xl  = 24px / 1.5rem   — titulo de secao
3xl  = 30px / 1.875rem — titulo de pagina, nome do caso
4xl  = 36px / 2.25rem  — headline
```

### Hierarquia Tipografica

```
H1 (titulo de pagina)   → 3xl / 30px, weight 600, tracking -0.025em, leading 1.2
H2 (secao)              → 2xl / 24px, weight 600, tracking -0.02em, leading 1.3
H3 (titulo de card)     → xl  / 20px, weight 600, leading 1.4
H4 (subsecao)           → lg  / 18px, weight 600, leading 1.4
Body                    → base / 16px, weight 400, leading 1.6
Body secondary          → sm  / 14px, weight 400, leading 1.5
Caption / Meta          → xs  / 12px, weight 500, text-muted-foreground
Mono inline             → sm  / 14px, JetBrains Mono, text-muted-foreground
Numero de processo      → sm  / 14px, JetBrains Mono, tabular-nums
```

### Largura de Linha

| Contexto | Max-width | Tailwind |
|---|---|---|
| Texto corrido (chat, descricoes) | 72ch | `max-w-prose` customizado |
| Editor de documento (artifact) | 80ch | Padding lateral generoso |
| Cards e componentes | Sem restricao (segue grid) | — |
| Titulos | 48ch | Evitar titulos que quebram em 3+ linhas |

---

## 7. Voz e Linguagem

### Principio

O AssistJur fala como um colega de escritorio competente: direto, preciso, sem jargao desnecessario. Nunca como um assistente de IA tentando ser util.

### Tom

| Atributo | Sim | Nao |
|---|---|---|
| **Direto** | "Contestacao pronta para revisao" | "Seu documento foi gerado com sucesso!" |
| **Concreto** | "3 pontos requerem verificacao" | "Alguns itens podem precisar de atencao" |
| **Profissional** | "Analisando documentos do caso" | "Estou lendo seus arquivos agora..." |
| **Neutro** | "Identificamos divergencia na data" | "Ops! Parece que ha um erro na data" |
| **Funcional** | "Revisar defesa trabalhista" | "Usar agente revisor de defesas" |

### Rotulos de Interface

| Contexto | Usar | Nao usar |
|---|---|---|
| Botao primario | "Redigir contestacao" | "Gerar contestacao" |
| Botao secundario | "Abrir caso" | "Iniciar novo caso" |
| Placeholder | "Descreva o caso ou envie documentos" | "Pergunte qualquer coisa ao assistente..." |
| Status de processamento | "Analisando 4 documentos (120 paginas)" | "O agente esta processando..." |
| Conclusao | "Contestacao pronta — 3 pontos para revisar" | "Pronto! Sua contestacao foi gerada com sucesso!" |
| Erro | "Falha ao processar documento. Tente novamente." | "Desculpe, algo deu errado..." |
| Vazio | "Nenhum caso aberto. Criar caso" | "Voce ainda nao tem casos. Que tal criar um?" |

### Regras

1. Nunca usar exclamacao em mensagens de sistema.
2. Nunca usar "voce" ou segunda pessoa em status e alertas. Usar forma impessoal ou terceira pessoa.
3. Nunca expor nomes de modelos de IA (Claude, GPT, etc.) na interface.
4. Nunca usar termos de IA: prompt, token, embedding, modelo, agente, inferencia, output.
5. Numeros de processo sempre em JetBrains Mono com tabular-nums.
6. Datas sempre no formato juridico brasileiro: "12 mar. 2025" ou "12/03/2025".
7. Valores monetarios com formato brasileiro: "R$ 1.234.567,89".

---

## 8. Espacamento

Grid de **4px**. Exclusivamente valores Tailwind.

| Uso | Valor | Tailwind |
|---|---|---|
| Intra-componente (icone + texto) | 8px | `gap-2` |
| Padding de card pequeno | 16px | `p-4` |
| Padding de card padrao | 24px | `p-6` |
| Gap entre cards | 16px | `gap-4` |
| Gap entre secoes | 32px | `gap-8` |
| Margem de secao | 32px a 48px | `my-8` a `my-12` |
| Container padding lateral (mobile) | 16px | `px-4` |
| Container padding lateral (desktop) | 24px a 32px | `px-6` a `px-8` |
| Gap entre paineis do split-view | 1px (border) ou 8px (com handle) | — |
| Padding interno de painel lateral | 16px | `p-4` |
| Padding do composer | 16px a 24px | `p-4` a `p-6` |
| Padding do artifact editor | 48px a 64px lateral | `px-12` a `px-16` (simula margem de documento impresso) |

---

## 9. Border Radius

| Classe | Valor | Uso |
|---|---|---|
| `rounded-xs` | 4px | Badges pequenos, tags |
| `rounded-sm` | 6px | Chips, code inline |
| `rounded-md` | 8px | **Base** — botoes, inputs, dropdowns |
| `rounded-lg` | 10px | Cards padrao, paineis |
| `rounded-xl` | 12px | Cards grandes, modais |
| `rounded-2xl` | 16px | Sheets, overlays |
| `rounded-full` | 9999px | Avatares, status dots |

Base: `--radius: 0.5rem` (8px). Mais contido que a v2.0 (que usava 10px). Reducao deliberada — bordas mais retas transmitem mais seriedade institucional.

---

## 10. Sombras / Elevacao

Sombras neutras. Sem glow de marca. Sem undertone colorido.

| Classe | Valor | Uso |
|---|---|---|
| `shadow-xs` | `0 1px 2px 0 rgb(0 0 0 / 0.03)` | Separacao sutil (inputs) |
| `shadow-sm` | `0 1px 3px 0 rgb(0 0 0 / 0.06)` | Cards em repouso |
| `shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.07)` | Cards hover, dropdowns |
| `shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.08)` | Modais, sidesheets |
| `shadow-xl` | `0 20px 25px -5px rgb(0 0 0 / 0.1)` | Command palette, toasts |

Nota v3.0: Removidos `shadow-brand` (glow roxo) e `shadow-gold` (glow dourado) da v2.0. Sombras com cor sao decoracao, nao funcionalidade.

### Hierarquia de Elevacao (z-index)

```
z-0   — Background do workspace
z-10  — Sidebar, paineis fixos
z-20  — Cards, artefatos
z-30  — Topbar (fixo)
z-40  — Dropdowns, popovers, tooltips
z-50  — Modais, dialogs
z-60  — Command palette
z-70  — Toasts, notificacoes
```

---

## 11. Layout System

### 11.1 AppShell

```
┌──────────────────────────────────────────────────────────────┐
│ Topbar (h-12, z-30, border-bottom)                           │
├──────────┬───────────────────────────────────────────────────┤
│ Sidebar  │ Main Content Area                                 │
│ (w-60)   │                                                   │
│          │                                                   │
│          │                                                   │
│          │                                                   │
│          │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

| Elemento | Dimensao | Tailwind | Colapsado |
|---|---|---|---|
| Topbar | 48px | `h-12` | — |
| Sidebar | 240px | `w-60` | `w-14` (56px, icones only) |
| Main content | `flex-1` | — | — |
| Min-width global | 1024px | `min-w-[1024px]` | — |

Nota v3.0: Topbar reduzida de 56px para 48px. Sidebar reduzida de 256px para 240px. Menos chrome, mais espaco para conteudo. A reducao da topbar aproxima o visual de ferramentas como Linear e Superhuman.

### 11.2 Workspace do Caso (Split-View)

```
┌──────────────────────────────────────────────────────────────┐
│ Case Header (h-14): nome | numero | status | acoes           │
├──────────────────────────┬───────────────────────────────────┤
│ Painel Esquerdo          │ Painel Direito                    │
│ (Chat + Fluxos)          │ (Documento / Editor)              │
│                          │                                   │
│ ┌──────────────────────┐ │ ┌───────────────────────────────┐│
│ │ Chat contextual      │ │ │ Documento editavel            ││
│ │ ou                   │ │ │                               ││
│ │ Fluxo guiado ativo   │ │ │                               ││
│ │                      │ │ │                               ││
│ ├──────────────────────┤ │ │                               ││
│ │ Composer             │ │ │                               ││
│ └──────────────────────┘ │ └───────────────────────────────┘│
└──────────────────────────┴───────────────────────────────────┘
```

**Proporcoes do split-view:**

| Estado | Esquerda | Direita | Quando |
|---|---|---|---|
| Chat dominante | 55% | 45% | Conversando, sem documento aberto |
| Equilibrado | 50% | 50% | Chat + documento ativo |
| Documento dominante | 35% | 65% | Revisando/editando peca |
| Documento full | 0% | 100% | Modo foco de edicao |
| Chat full | 100% | 0% | Sem documento, interacao livre |

Divisor arrastavel. Double-click no divisor volta ao 50/50. Atalho de teclado para alternar modos.

### 11.3 Painel de Contexto (3a Coluna)

```
┌──────────────────┬────────────────────────┬───────────┐
│ Chat / Fluxo     │ Documento / Editor     │ Contexto  │
│                  │                        │           │
│                  │                        │ Numero    │
│                  │                        │ Tribunal  │
│                  │                        │ Partes    │
│                  │                        │ Teses     │
│                  │                        │ Docs      │
│                  │                        │ Fontes    │
└──────────────────┴────────────────────────┴───────────┘
```

| Elemento | Dimensao | Comportamento |
|---|---|---|
| Painel de contexto | `w-72` (288px) | Retratil via toggle |

Nota v3.0: Na v2.0, metadados e fontes eram paineis separados que se alternavam. Na v3.0, sao abas dentro do mesmo painel de contexto. Mais simples.

### 11.4 Home / Casos

**Nunca abre em estado de chat vazio.**

```
┌──────────────────────────────────────────────────────────┐
│ Header: Busca + "Criar caso" + "Subir documentos"        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ [Secao: Continue de onde parou]                           │
│   CaseCard  CaseCard  CaseCard                           │
│                                                          │
│ [Secao: Fluxos frequentes]                               │
│   FlowCard  FlowCard  FlowCard  FlowCard                │
│                                                          │
│ [Secao: Todos os casos]                                  │
│   Lista/grid de CaseCards com filtros e busca             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

| Contexto | Colunas (desktop / tablet / mobile) | Gap |
|---|---|---|
| CaseCards | 3 / 2 / 1 | `gap-4` |
| FlowCards | 4 / 2 / 1 | `gap-3` |
| Biblioteca de fluxos | 3 / 2 / 1 | `gap-4` |

---

## 12. Componentes Primitivos

### Button

```tsx
// Variantes:
<Button variant="default">       // brand purple — acao primaria
<Button variant="secondary">     // cinza neutro — acao secundaria
<Button variant="outline">       // borda + transparente
<Button variant="ghost">         // sem borda, hover sutil
<Button variant="destructive">   // vermelho — acoes irreversiveis
<Button variant="link">          // texto com underline

// Tamanhos:
<Button size="sm">       // h-8, 32px
<Button size="default">  // h-9, 36px
<Button size="lg">       // h-10, 40px
<Button size="icon">     // 36x36px
<Button size="icon-sm">  // 28x28px
```

**Regras:**
- Maximo 1 `default` (purple) por secao visual.
- `destructive` sempre com confirmacao (dialog).
- Icone + texto: `gap-2`, SVG com `size-4`.
- Sem variante `gold` como botao padrao. Gold so aparece em contextos de upgrade/assinatura e com moderacao extrema.
- Sem variante `outline-brand`. Se precisa de enfase, use `default`. Se nao, use `outline` ou `ghost`.

Nota v3.0: Botoes menores que na v2.0 (h-9 padrao vs h-10). Reducao de variantes de 8 para 6. Menos opcoes = mais consistencia.

### Badge

```tsx
<Badge variant="default">       // purple — identidade
<Badge variant="secondary">     // cinza neutro
<Badge variant="outline">       // so borda
<Badge variant="success">       // verde
<Badge variant="warning">       // ambar
<Badge variant="destructive">   // vermelho

// Workflow:
<Badge variant="workflow-draft">
<Badge variant="workflow-active">
<Badge variant="workflow-review">
<Badge variant="workflow-done">
<Badge variant="workflow-blocked">

// Rastreabilidade:
<Badge variant="source-document">   // azul — extraido de documento
<Badge variant="source-suggested">  // ambar — sugestao do sistema
<Badge variant="source-review">     // vermelho — revisao necessaria
<Badge variant="source-verified">   // verde — verificado pelo advogado
```

Nota v3.0: Removidas variantes `brand` e `gold` de badge. Badges de rastreabilidade renomeados de `source`/`inference`/`needs-review` para nomenclatura centrada no usuario.

### Card

```tsx
<Card>   // bg-card, rounded-lg, border, shadow-sm
  <CardHeader>
    <CardTitle />
    <CardDescription />
    <CardAction />
  </CardHeader>
  <CardContent />
  <CardFooter />
</Card>
```

### Input / Textarea

Focus ring: `ring-ring` = brand purple. Altura padrao `h-9`. Border `border-input`. Border radius `rounded-md`.

---

## 13. Componentes Compostos

### 13.1 CaseCard

```tsx
<CaseCard>
  <CaseCardHeader>
    <CaseCardTitle />           {/* Nome do caso — H3 */}
    <CaseCardNumber />          {/* N. do processo — JetBrains Mono, muted */}
    <WorkflowBadge />           {/* Status: rascunho | ativo | revisao | concluido */}
  </CaseCardHeader>
  <CaseCardMeta>
    <MetaItem label="Vara" value="2a Vara do Trabalho" />
    <MetaItem label="Partes" value="Fulano vs Empresa X" />
    <MetaItem label="Atualizado" value="ha 2 horas" />
  </CaseCardMeta>
  <CaseCardFooter>
    <CaseCardActions />         {/* Botoes: Abrir, Menu */}
  </CaseCardFooter>
</CaseCard>
```

| Elemento | Tipografia | Cor |
|---|---|---|
| Nome do caso | xl / 20px, weight 600 | `text-foreground` |
| Numero do processo | sm / 14px, JetBrains Mono, tabular-nums | `text-muted-foreground` |
| Metadados | sm / 14px | `text-muted-foreground` |
| Badge de status | xs / 12px, weight 500 | Token de workflow |

Dimensoes: min-width 280px, max-width 400px, padding `p-5`.

Nota v3.0: Removido icone por metadado (Scale, Users, Clock da v2.0). Metadados usam label + valor textual. Menos icones = visual mais limpo. Removida barra de progresso — estado processual ja comunicado pelo badge.

### 13.2 FlowCard

Componente primario de descoberta. Representa uma tarefa juridica concreta.

```tsx
<FlowCard>
  <FlowCardHeader>
    <FlowCardTitle />           {/* Verbo de acao: "Revisar defesa" — H4 */}
    <FlowCardBadge />           {/* Area: "Trabalhista" — badge outline */}
  </FlowCardHeader>
  <FlowCardDescription />       {/* 1-2 linhas — Body secondary */}
  <FlowCardMeta>
    <FlowInputs />              {/* "Requer: peticao inicial, defesa" */}
    <FlowOutput />              {/* "Resultado: relatorio de revisao" */}
  </FlowCardMeta>
  <FlowCardCTA />               {/* "Iniciar revisao" — outline */}
</FlowCard>
```

**Regras:**
- Titulos como verbos de acao: "Revisar defesa", "Redigir contestacao", "Extrair cronologia".
- CTA especifico ao fluxo: "Iniciar revisao", "Redigir contestacao". Nunca "Usar agente".
- Sem icone de 40x40 com circulo de background (removido da v2.0). Titulo e badge sao suficientes.
- Dimensoes: min-width 220px, max-width 300px, padding `p-4`.

### 13.3 PromptComposer

```tsx
<PromptComposer>
  <ComposerContext>             {/* Barra superior: "Caso: Ygor x CBD | 4 documentos" */}
    <ContextCaseName />
    <ContextDocCount />         {/* "4 documentos · 120 paginas" */}
  </ComposerContext>
  <ComposerInput>
    <TextareaAutosize />        {/* Campo principal — cresce com conteudo */}
  </ComposerInput>
  <ComposerToolbar>
    <AttachButton />            {/* Anexar documento */}
    <SuggestionChips />         {/* Sugestoes rapidas contextuais */}
    <SendButton />              {/* brand purple, icone ArrowUp */}
  </ComposerToolbar>
</PromptComposer>
```

**Regras:**
- Placeholder: "Descreva o caso, envie documentos ou peca uma analise..."
- `ContextDocCount` atualiza em tempo real.
- `SuggestionChips` mudam com base no estagio do caso e documentos disponiveis.
- Background: `surface-composer`. Border: `border`. Shadow: `shadow-sm`.
- Altura minima: 48px. Maxima: 180px (scrollable).

Nota v3.0: Removidos `ToolButton` e `AgentSelector` do composer (v2.0). Seletor de ferramenta gera confusao. Seletor de agente e desnecessario se o fluxo ja define o agente. Simplificacao deliberada.

### 13.4 SourcePanel

Painel de fontes e evidencias — aba dentro do Painel de Contexto.

```tsx
<SourcePanel>
  <SourcePanelHeader>
    <Title />                   {/* "Fontes" — H4 */}
    <SourceStats />             {/* "12 fontes · 3 sugestoes · 1 revisao" */}
  </SourcePanelHeader>
  <SourcePanelTabs>
    <Tab>Documentos</Tab>
    <Tab>Jurisprudencia</Tab>
    <Tab>Legislacao</Tab>
  </SourcePanelTabs>
  <SourceList>
    <SourceItem>
      <SourceTitle />           {/* Nome do documento */}
      <SourceLocation />        {/* "p. 47, par. 3" — JetBrains Mono */}
      <SourceBadge />           {/* source-document | source-suggested | source-review */}
      <SourceExcerpt />         {/* Trecho relevante — max 3 linhas */}
    </SourceItem>
  </SourceList>
</SourcePanel>
```

**Regras:**
- Cada `SourceItem` clicavel — abre documento na posicao exata.
- Badges: azul (fonte direta), ambar (sugestao), vermelho (revisao obrigatoria).
- Nunca esconder fontes atras de mais de 1 clique.
- Sem icone por tipo de documento (removido da v2.0). Titulo e localizacao sao suficientes.

### 13.5 ArtifactEditor

Editor de documento/peca juridica.

```tsx
<ArtifactEditor>
  <ArtifactToolbar>
    <ArtifactTitle />           {/* "Contestacao — Caso Ygor x CBD" — H3 */}
    <VersionSelector />         {/* "v3 (atual)" — dropdown */}
    <ArtifactActions>
      <ExportButton />          {/* Exportar .docx */}
      <CompareButton />         {/* Comparar versoes */}
      <FullscreenButton />      {/* Modo foco */}
    </ArtifactActions>
  </ArtifactToolbar>
  <ArtifactBody>
    <Editor />                  {/* Rich text — ProseMirror ou similar */}
    <InlineAnnotations>
      <SystemNote />            {/* Nota lateral: sugestao, ponto de revisao */}
      <SourceHighlight />       {/* Trecho vinculado a fonte */}
      <ReviewMarker />          {/* Marcador de revisao necessaria */}
    </InlineAnnotations>
  </ArtifactBody>
  <ArtifactFooter>
    <WordCount />
    <LastSaved />
    <SourceSummary />           {/* "14 fontes · 2 sugestoes · 1 revisao" */}
  </ArtifactFooter>
</ArtifactEditor>
```

**Regras:**
- Background: `surface-artifact`. Padding lateral `px-12` a `px-16` para simular documento.
- `SystemNote` renderiza na margem direita, alinhado ao paragrafo. Background: `source-suggested-bg`. Sem icone de centelha — usa icone `MessageSquare` ou sem icone.
- `SourceHighlight`: underline pontilhado azul. Hover abre popover com dados da fonte.
- `ReviewMarker`: indicador ambar na margem. Clicavel — filtra SourcePanel.

Nota v3.0: `AIComment` renomeado para `SystemNote`. `ReviewFlag` renomeado para `ReviewMarker`. Nomenclatura neutra, sem referencia explicita a IA.

### 13.6 CaseTimeline

```tsx
<CaseTimeline>
  <TimelineItem>
    <TimelineDot status="done" />
    <TimelineDate />            {/* "12 mar. 2025" — xs, JetBrains Mono */}
    <TimelineContent>
      <TimelineTitle />         {/* "Peticao inicial recebida" */}
      <TimelineDescription />
      <TimelineAttachments />   {/* Docs vinculados */}
    </TimelineContent>
  </TimelineItem>
  <TimelineConnector />         {/* Linha vertical, 1px, border-subtle */}
</CaseTimeline>
```

Orientacao vertical, mais recente no topo. `TimelineDot` usa cores de workflow. Clicavel.

### 13.7 CaseHeader

```tsx
<CaseHeader>
  <CaseHeaderLeft>
    <BackButton />
    <CaseTitle />               {/* H2 */}
    <CaseNumber />              {/* JetBrains Mono, muted */}
    <WorkflowBadge />
  </CaseHeaderLeft>
  <CaseHeaderRight>
    <Button variant="outline">Subir documentos</Button>
    <Button variant="default">Iniciar fluxo</Button>
    <MoreMenu />
  </CaseHeaderRight>
</CaseHeader>
```

Height: 56px (`h-14`). Background: `surface-workspace`. Border-bottom: `border`.

### 13.8 UploadZone

```tsx
<UploadZone>
  <DropArea>
    <UploadTitle />             {/* "Arraste documentos do processo" */}
    <UploadSubtitle />          {/* "PDF, DOCX — ate 50MB por arquivo" */}
    <UploadButton />            {/* "Escolher arquivos" — outline */}
  </DropArea>
  <UploadList>
    <UploadItem>
      <FileName />
      <FileSize />
      <ProcessingStatus />      {/* Barra de progresso ou icone de check */}
      <FileTypeTag />           {/* Auto-detectado: "Peticao inicial" */}
    </UploadItem>
  </UploadList>
  <UploadSuggestions>           {/* Pos-upload: proximos passos */}
    <SuggestionChip>Resumir documentos</SuggestionChip>
    <SuggestionChip>Extrair cronologia</SuggestionChip>
    <SuggestionChip>Revisar defesa</SuggestionChip>
  </UploadSuggestions>
</UploadZone>
```

**Regras:**
- Estado drag-over: border `border-primary`, bg `primary/5`.
- Apos upload: nunca estado morto. Sempre mostrar `UploadSuggestions`.
- `FileTypeTag` sugere automaticamente o tipo com opcao de corrigir.
- Sem icone grande centralizado na area de drop. Texto e suficiente.

### 13.9 CommandPalette

```tsx
<CommandPalette>                {/* Dialog central, shadow-xl */}
  <CommandInput />              {/* Busca — autofocus */}
  <CommandGroups>
    <CommandGroup title="Casos">
      <CommandItem />           {/* Caso + numero + status */}
    </CommandGroup>
    <CommandGroup title="Fluxos">
      <CommandItem />           {/* Nome do fluxo */}
    </CommandGroup>
    <CommandGroup title="Documentos">
      <CommandItem />           {/* Doc + caso associado */}
    </CommandGroup>
    <CommandGroup title="Acoes">
      <CommandItem />           {/* "Novo caso", "Subir documento" */}
    </CommandGroup>
  </CommandGroups>
</CommandPalette>
```

Atalho: `Cmd+K` / `Ctrl+K`. Max-width 560px. Max-height 380px. Centrado. z-60.

### 13.10 SmartTemplate

Modal de fluxo guiado — substitui prompt livre por formulario contextual.

```tsx
<SmartTemplate>
  <TemplateHeader>
    <TemplateTitle />           {/* "Redigir contestacao" */}
    <TemplateDescription />     {/* "Preencha os dados do caso" */}
  </TemplateHeader>
  <TemplateForm>
    <TemplateField label="Valor da causa" type="currency" />
    <TemplateField label="Houve pericia?" type="boolean" />
    <TemplateField label="Teses principais" type="textarea" />
    <TemplateField label="Documentos" type="file-select" />
  </TemplateForm>
  <TemplateFooter>
    <Button variant="ghost">Cancelar</Button>
    <Button variant="default">Redigir contestacao</Button>
  </TemplateFooter>
</SmartTemplate>
```

**Regras:**
- Maximo 6 campos por template.
- Campos opcionais visualmente distintos.
- Apos submit: transicao direta para workspace com documento abrindo.
- Sem icone no header (removido da v2.0). Titulo e descricao sao suficientes.
- Removido `TemplateEstimate` ("~4 min"). Estimativa de tempo gera expectativa e frustacao. Usar indicador de progresso real durante processamento.

### 13.11 ProcessingIndicator

Substitui o `AgentStatus` da v2.0. Indicador de atividade do sistema.

```tsx
<ProcessingIndicator>
  <ProcessingLabel />           {/* "Analisando 4 documentos (120 paginas)" */}
  <ProcessingProgress />        {/* Barra de progresso — opcional */}
</ProcessingIndicator>
```

| Estado | Label | Visual |
|---|---|---|
| Idle | — | Nao exibido |
| Processando | "Analisando documentos..." | Barra de progresso ou spinner discreto |
| Redigindo | "Redigindo contestacao..." | Texto aparecendo em streaming |
| Concluido | "Contestacao pronta — 3 pontos para revisar" | Texto estatico, desaparece apos 5s |
| Erro | "Falha ao processar. Tente novamente." | Texto + botao de retry |

Nota v3.0: Removido o `AgentStatusDot` animado com cor de marca e `animate-pulse`. Pulsacao colorida e padrao de chatbot. Usar barra de progresso ou spinner nativo, discreto, sem cor de marca.

---

## 14. Padroes de Rastreabilidade

Sistema de rastreabilidade — pilar de UX. Cada resultado deve comunicar a origem das informacoes.

### 14.1 Tipos

| Tipo | Cor | Significado | Label |
|---|---|---|---|
| **Fonte direta** | `source-document` (azul) | Extraido literalmente de documento | "Fonte: [doc], p. [X]" |
| **Sugestao** | `source-suggested` (ambar) | Elaborado pelo sistema com base no contexto | "Sugestao — verificar" |
| **Revisao obrigatoria** | `source-review` (vermelho) | Ponto critico que exige conferencia humana | "Revisao necessaria" |
| **Verificado** | `source-verified` (verde) | Conferido e aprovado pelo advogado | "Verificado" |

### 14.2 No Editor de Documento

- **Trecho com fonte:** underline pontilhado azul. Hover abre popover com documento, pagina e paragrafo de origem.
- **Sugestao do sistema:** highlight ambar suave no background. Nota lateral na margem (sem icone de centelha).
- **Revisao obrigatoria:** highlight vermelho suave + marcador na margem. Click abre SourcePanel filtrado.
- **Verificado:** indicador discreto na margem apos aprovacao do advogado.

### 14.3 No Chat

```tsx
<ChatMessage role="assistant">
  <p>
    O prazo para contestacao vence em
    <SourceTag doc="Peticao Inicial" page="3">15 dias uteis</SourceTag>,
    contados da
    <SuggestedTag>data de juntada do AR</SuggestedTag>.
    <ReviewTag>Verificar se houve prorrogacao por convencao coletiva.</ReviewTag>
  </p>
</ChatMessage>
```

Nota v3.0: Tags renomeadas de `InferenceTag` para `SuggestedTag`, de `ReviewAlert` para `ReviewTag`. Linguagem centrada no usuario.

### 14.4 Resumo de Rastreabilidade

Aparece no footer do editor e no final de respostas longas:

```tsx
<SourceSummary>
  <SourceCount type="document" count={14} />    {/* "14 fontes" */}
  <SourceCount type="suggested" count={3} />     {/* "3 sugestoes" */}
  <SourceCount type="review" count={1} />        {/* "1 revisao" */}
</SourceSummary>
```

---

## 15. Estados de Interacao

| Estado | Implementacao |
|---|---|
| **Default** | Conforme tokens base |
| **Hover** | `hover:bg-accent` ou opacity shift — sutil, sem salto |
| **Focus** | `focus-visible:ring-2 focus-visible:ring-ring ring-offset-2` — anel roxo nitido |
| **Active** | `active:scale-[0.98]` ou leve escurecimento |
| **Disabled** | `opacity-50 pointer-events-none` |
| **Loading** | Skeleton com `animate-pulse` + `bg-muted` |
| **Error** | Border `border-destructive`, texto `text-destructive` |
| **Selected (sidebar)** | `bg-surface-sidebar-active`, `text-primary`, `font-medium` |
| **Drag-over (upload)** | `border-primary`, `bg-primary/5` |
| **Processing** | Barra de progresso ou spinner + label textual |
| **Generating** | Texto em streaming + cursor piscante |
| **Split-resize** | Cursor `col-resize`, highlight em `border-split` |

---

## 16. Dark / Light Mode

**Ambos suportados.** Default: `light`.

- Toggle via `next-themes` com atributo `class` em `<html>`.
- Script inline no `<head>` previne FOUC.
- Theme color meta tag atualizado dinamicamente.

**Diretrizes:**
- Light mode: trabalho diurno. Branco, limpo, bordas suaves, espacamento generoso.
- Dark mode: noturno premium. Fundo roxo profundo (nao preto zinc, nao preto puro). Identidade da marca aparece no background escuro.

**Nunca usar cores hardcoded** em componentes. Sempre tokens semanticos.

Tokens de rastreabilidade e workflow funcionam em ambos os modos via CSS custom properties em `.dark`.

---

## 17. Iconografia

### Biblioteca

**Lucide React**. Estilo outline. Tamanho padrao: 20px. Stroke-width: 1.5.

### Mapeamento por Dominio

| Dominio | Icones |
|---|---|
| Caso / Processo | `Briefcase`, `Scale`, `Gavel` |
| Documentos | `FileText`, `Files`, `Upload`, `Download` |
| Chat | `MessageSquare`, `Send` |
| Fluxos / Tarefas | `ListChecks`, `Play`, `ArrowRight` |
| Rastreabilidade | `ShieldCheck`, `AlertTriangle`, `CheckCircle`, `FileSearch` |
| Navegacao | `Home`, `Search`, `Settings`, `ChevronRight`, `ArrowLeft` |
| Status | `Clock`, `Check`, `X`, `Loader2` |
| Editor | `Bold`, `Italic`, `List`, `Undo`, `Redo` |

### Icones removidos (v3.0)

| Icone | Motivo |
|---|---|
| `Sparkles` | Cliche de IA. O sistema nao precisa sinalizar que "e IA" |
| `Bot` | Infantiliza. Avatar do sistema usa marca ou icone de dominio |
| `Wand2` / `Zap` | Associacao com "magia" / efeito instantaneo |
| `Brain` | Referencia explicita a IA/ML |

### Regras de Uso

- Em botoes: `size-4` (16px), `gap-2` com texto.
- Em cards: `size-5` (20px).
- Em badges: `size-3` (12px).
- Cor: herda do texto pai (`currentColor`). Nunca cor fixa.
- Maximo 1 icone por label. Se o texto e claro, icone e opcional.

---

## 18. Motion e Animacao

### Principio

Animacoes comunicam estado e direcionalidade. Nunca decorativas. Nunca chamam atencao para si mesmas.

### Duracoes

| Token | Valor | Uso |
|---|---|---|
| `--duration-fast` | `100ms` | Hover, focus |
| `--duration-base` | `150ms` | Transicoes de estado, toggle |
| `--duration-slow` | `250ms` | Abertura de painel, expand/collapse |
| `--duration-slower` | `400ms` | Entrada de modal, overlay |

Nota v3.0: Duracoes reduzidas em relacao a v2.0 (200ms > 150ms base, 300ms > 250ms slow). Interface mais responsiva.

### Easing

`ease-out` para entradas. `ease-in` para saidas. `ease-in-out` para toggles.

### Animacoes por Componente

| Componente | Animacao |
|---|---|
| Sidebar collapse | Slide + fade, `duration-slow` |
| Split-view resize | Instantaneo (sem animacao) |
| Modal / dialog | Scale-up (`0.98 > 1`) + fade, `duration-slower` |
| Toast | Slide-in from top-right, `duration-slow` |
| Skeleton loading | `animate-pulse`, `bg-muted` |
| Command palette | Scale-up + fade, `duration-base` |
| Streaming de texto | Aparecimento caractere a caractere, sem animacao adicional |

### O que NAO animar

- Dots pulsantes coloridos (padrao chatbot).
- Glow ou halo em elementos.
- Transicoes de cor em background de superficie.
- Rotacao de icones durante loading (usar `Loader2` com `animate-spin` apenas).

---

## 19. Responsividade

### Breakpoints

| Nome | Valor | Contexto |
|---|---|---|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet portrait |
| `lg` | 1024px | Tablet landscape / desktop pequeno |
| `xl` | 1280px | Desktop padrao |
| `2xl` | 1536px | Desktop grande |

### Comportamento por Breakpoint

| Componente | < `lg` | `lg` a `xl` | > `xl` |
|---|---|---|---|
| Sidebar | Sheet overlay | Colapsada (`w-14`) | Expandida (`w-60`) |
| Split-view | Stack vertical | Split 50/50 | Split ajustavel |
| Painel de contexto | Hidden (acesso via tab) | Hidden (toggle) | Visivel (`w-72`) |
| Home grid | 1 coluna | 2 colunas | 3 colunas |
| Command palette | Fullscreen | Centrado, 80% width | Centrado, 560px |
| Composer | Full-width, fixo no bottom | Dentro do painel esquerdo | Dentro do painel esquerdo |

### Prioridade Mobile

Desktop-first. Mobile permite:
- Consultar caso e status
- Ler documento
- Enviar mensagem
- Ver fontes

Nao prioritario em mobile: editar documentos, split-view completo, drag-and-drop.

---

## 20. Guidelines de Consistencia

### Hierarquia de Uso de Cores

```
1. Tokens semanticos (bg-background, text-foreground)       ← sempre preferir
2. Tokens de layout (bg-surface-workspace, border-split)    ← para estrutura
3. Tokens de workflow/rastreabilidade (workflow-active, etc) ← para estados de dominio
4. Tokens de marca via Tailwind (bg-brand-purple-100)       ← decorativos, com parcimonia
5. Primitivos (--assistjur-purple-600)                       ← so em CSS global
6. Valores hardcoded (#7c3aed)                               ← NUNCA em componentes
```

### Regras Inviolaveis

1. **`--primary` e roxo.** Nunca sobrescrever para preto/cinza.
2. **Gold e escasso.** Maximo 1 elemento gold por viewport. Preferencialmente zero.
3. **Sidebar mais escura no dark mode.** Preserva profundidade.
4. **Focus ring sempre visivel.** Nunca remover outline/ring sem substituto.
5. **Selecao de texto usa cor de marca.** `::selection` definida no globals.css.
6. **Scrollbar consistente.** 6px, cor `var(--border)`.
7. **Caso e entidade principal.** Toda tela dentro do workspace exibe contexto do caso no header.
8. **Upload nunca e estado morto.** Sempre seguido de sugestoes.
9. **Fontes a 1 clique.** Painel de fontes nunca escondido atras de mais de 1 interacao.
10. **Linguagem juridica, nunca tecnica.** Labels em PT-BR juridico. Sem jargao de IA.
11. **Sem emojis na interface.** Icones Lucide quando necessario. Emojis sao informais demais para contexto juridico.
12. **Sem referencia explicita a IA.** O produto e a ferramenta. IA e infraestrutura.

### Escala de Responsabilidade dos Arquivos

| Arquivo | O que define |
|---|---|
| `app/globals.css` | Tokens CSS, utilidades globais, base layer |
| `lib/design-tokens.ts` | Mesmos valores para uso em JS/TS |
| `components/ui/button.tsx` | Variantes de botao (CVA) |
| `components/ui/badge.tsx` | Variantes de badge (CVA) — workflow + rastreabilidade |
| `components/ui/*.tsx` | Primitivos — so usam tokens |
| `components/case/*.tsx` | CaseCard, CaseHeader, CaseTimeline |
| `components/flow/*.tsx` | FlowCard, SmartTemplate |
| `components/document/*.tsx` | ArtifactEditor, InlineAnnotations |
| `components/source/*.tsx` | SourcePanel, SourceItem, SourceBadge |
| `components/chat/*.tsx` | PromptComposer, ChatMessage, ProcessingIndicator |
| `components/layout/*.tsx` | AppShell, SplitView, Sidebar |
| `docs/DESIGN-SYSTEM.md` | Este arquivo — fonte da verdade |

Nota v3.0: `components/artifact/` renomeado para `components/document/`. "Artefato" e jargao tecnico. "Documento" e o que o advogado entende.

### Como Adicionar Variante

```tsx
// 1. No cva() do componente
variant: {
  "minha-variante": "bg-secondary text-secondary-foreground hover:bg-secondary/80",
}

// 2. Sempre tokens — nunca hardcoded
// Correto:  bg-secondary
// Errado:   bg-[#f5f5f4]

// 3. Dark mode via prefix
"dark:bg-neutral-800 dark:text-neutral-200"
```

### Como Adicionar Cor

```css
/* 1. Em globals.css — primitivos de marca */
:root {
  --assistjur-minha-cor: #xxxxxx;
}

/* 2. Em @theme — para Tailwind */
@theme {
  --color-brand-minha-cor: var(--assistjur-minha-cor);
}

/* 3. Em lib/design-tokens.ts — para JS */
export const brand = {
  minhaCor: "#xxxxxx",
}
```

### Como Adicionar Componente Composto

```tsx
// 1. Criar em components/{dominio}/meu-componente.tsx
// 2. Usar APENAS primitivos do design system (Button, Badge, Card)
// 3. Usar APENAS tokens semanticos
// 4. Documentar anatomia neste DESIGN-SYSTEM.md
// 5. Nunca importar cores hardcoded
// 6. Nunca usar emojis ou icones de IA (Sparkles, Bot, Brain, Wand)
// 7. Labels em portugues juridico
```

---

## 21. Escalar o Produto

### Proximas Fases

**P1 — Muito importante:**
- `<DataTable>` — tabela juridica com filtros, paginacao, acoes por linha
- `<DocumentViewer>` — visualizacao de PDF com highlighting de fonte
- `<LegalHighlight>` — destaque de trecho juridico com tooltip de contexto
- `<VersionDiff>` — comparacao entre versoes de documento
- `<OnboardingFlow>` — wizard de primeiro acesso com caso-exemplo

**P2 — Expansao:**
- `<WitnessMap>` — mapa de testemunhas com roteiro
- `<ProductivityDashboard>` — metricas de trabalho por caso
- `<CollaborationPanel>` — atividade da equipe no caso
- `<AuditLog>` — trilha de auditoria
- `<CustomFlowBuilder>` — construtor de fluxos personalizados

### Padrao de Componente Novo

```tsx
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const componentVariants = cva(
  "inline-flex items-center rounded-md border font-medium text-sm transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export interface MeuComponenteProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof componentVariants> {}

export function MeuComponente({ className, variant, ...props }: MeuComponenteProps) {
  return <div className={cn(componentVariants({ variant }), className)} {...props} />
}
```
