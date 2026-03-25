# Design System — AssistJur

**Conceito:** Legal Intelligence — Mesa de Comando do Contencioso
**Stack:** Tailwind CSS v4 · shadcn/ui · CSS Custom Properties · Geist
**Versão:** 2.0

---

## Índice

1. [Diagnóstico e Evolução](#1-diagnóstico-e-evolução)
2. [Direção Estética](#2-direção-estética)
3. [Paleta de Cores](#3-paleta-de-cores)
4. [Tokens Semânticos](#4-tokens-semânticos)
5. [Tipografia](#5-tipografia)
6. [Espaçamento](#6-espaçamento)
7. [Border Radius](#7-border-radius)
8. [Sombras / Elevação](#8-sombras--elevação)
9. [Layout System](#9-layout-system)
10. [Componentes Primitivos](#10-componentes-primitivos)
11. [Componentes Compostos](#11-componentes-compostos)
12. [Padrões de Confiança](#12-padrões-de-confiança)
13. [Estados de Interação](#13-estados-de-interação)
14. [Dark / Light Mode](#14-dark--light-mode)
15. [Iconografia e Ilustração](#15-iconografia-e-ilustração)
16. [Motion e Animação](#16-motion-e-animação)
17. [Responsividade](#17-responsividade)
18. [Guidelines de Consistência](#18-guidelines-de-consistência)
19. [Escalar o Produto](#19-escalar-o-produto)

---

## 1. Diagnóstico e Evolução

### O que existia (v1.0)

| Problema | Impacto |
|---|---|
| `--primary` era preto genérico (shadcn default) | Botões sem identidade; poderiam ser de qualquer produto |
| Tokens de marca (`--assistjur-purple`) isolados | Cores usadas só no auth layout e skip link, nunca no produto |
| Dark mode com fundo `hsl(240 10% 3.9%)` — zinc puro | Sem personalidade; idêntico a N outros apps shadcn |
| Sidebar dark = cinza escuro genérico | Nenhuma hierarquia visual entre sidebar e conteúdo |
| Paleta incompleta: só 7 tokens de marca | Impossível escalar sem inventar valores novos a cada componente |
| Sombras: apenas shadow-sm genérico | Sem sistema de elevação |
| Sem componentes compostos | Cada tela reinventa cards, painéis e layouts |
| Sem padrões de layout definidos | AppShell, split-view e 3 colunas eram ad-hoc |
| Sem sistema de confiança/fontes | IA sem rastreabilidade visível na UI |

### O que muda (v2.0)

| Área | Evolução |
|---|---|
| **Paleta** | Adição de cores de workflow, confiança e status processual |
| **Tokens** | Novos tokens semânticos para caso, fontes e artefatos |
| **Layout** | AppShell formal, split-view, grid de 3 colunas, breakpoints definidos |
| **Componentes** | 12+ componentes compostos: CaseCard, FlowCard, SourcePanel, ArtifactEditor, Timeline, etc. |
| **Confiança** | Sistema visual de rastreabilidade: fontes, inferência, alertas de revisão |
| **Conceito** | De "chat com marca" para "workspace jurídico por caso" |

---

## 2. Direção Estética

### Conceito: "Legal Intelligence — Mesa de Comando"

Precisão de ferramenta jurídica + fluidez de SaaS moderno + organização por caso/processo.

**Referências:** Linear (clareza), Vercel (minimalismo premium), Notion (conforto diário), Harvey (seriedade jurídica)
**Anti-referências:** Salesforce (pesado), LegalZoom (corporativo-genérico), Lexis Nexis (anos 2000), "chat genérico com roupa jurídica"

### Princípios

1. **Marca no produto inteiro** — O roxo da AssistJur é o primary. Quem usa o produto vê a marca a cada clique, focus ring e estado ativo.
2. **Dark mode profundo, não genérico** — Fundo roxo profundo (`hsl(256 32% 5%)`) cria identidade. Não é black, não é zinc — é AssistJur à noite.
3. **Gold com parcimônia** — A cor dourada é CTA de destaque. Nunca em áreas grandes. Sempre em par com roxo.
4. **Densidade informacional confortável** — Chat jurídico requer leitura longa. Espaçamento generoso, linha legível (leading 1.5), fontes médias.
5. **Zero ambiguidade de estado** — Focus rings vibrantes (roxo da marca), hover explícito, disabled claro.
6. **Caso antes do chat** — A unidade principal da navegação é o caso/processo. O chat existe dentro do caso.
7. **Confiança é parte da interface** — Fontes, trechos usados, alertas de revisão e origem das informações são componentes visíveis, não marketing.
8. **Menos escolha, mais orientação** — Sugerir o próximo melhor passo em vez de expor catálogo infinito de agentes.

---

## 3. Paleta de Cores

### Purple — Cor Dominante

| Token CSS | Valor | Uso |
|---|---|---|
| `--assistjur-purple-50` | `#f5f3ff` | Backgrounds de destaque suave |
| `--assistjur-purple-100` | `#ede9fe` | Badge brand (light), chips |
| `--assistjur-purple-200` | `#ddd6fe` | Borders decorativas |
| `--assistjur-purple-400` | `#a78bfa` | Light purple nos componentes |
| **`--assistjur-purple-600`** | **`#7c3aed`** | **Brand primary — botões, links, active** |
| `--assistjur-purple-700` | `#6d28d9` | Hover sobre primary |
| `--assistjur-purple-900` | `#3f1c6b` | Dark backgrounds decorativos |
| **`--assistjur-purple-950`** | **`#2e1065`** | **Auth layout, auth backgrounds** |

### Gold — Acento

| Token CSS | Valor | Uso |
|---|---|---|
| `--assistjur-gold-300` | `#fde047` | Highlights suaves |
| `--assistjur-gold-400` | `#facc15` | Ícones de destaque |
| **`--assistjur-gold-500`** | **`#eab308`** | **CTAs premium, botão gold** |
| `--assistjur-gold-600` | `#ca8a04` | Hover em elementos gold |
| `--assistjur-gold-700` | `#a16207` | Textos sobre fundo gold |

### Neutral (warm undertone)

Escala de `--assistjur-neutral-50` a `--assistjur-neutral-950`.
Tons ligeiramente lilás (não zinc puro) para manter coerência com a paleta.

### Status

| Uso | Cor | Light BG |
|---|---|---|
| Sucesso | `#16a34a` (verde) | `#dcfce7` |
| Alerta | `#d97706` (âmbar) | `#fef3c7` |
| Erro | `#dc2626` (vermelho) | `#fee2e2` |
| Info | `#2563eb` (azul) | `#dbeafe` |

### Workflow — Status de Caso/Processo (novo)

Cores dedicadas para representar estados do fluxo processual.

| Token CSS | Valor | Uso |
|---|---|---|
| `--workflow-draft` | `hsl(252 15% 60%)` | Rascunho / em construção |
| `--workflow-draft-bg` | `hsl(252 20% 95%)` | Background de rascunho |
| `--workflow-active` | `hsl(262 83% 57%)` | Em andamento (= brand purple) |
| `--workflow-active-bg` | `hsl(262 30% 95%)` | Background ativo |
| `--workflow-review` | `hsl(38 92% 50%)` | Aguardando revisão humana (= gold) |
| `--workflow-review-bg` | `hsl(48 96% 95%)` | Background de revisão |
| `--workflow-done` | `hsl(142 71% 36%)` | Concluído / aprovado |
| `--workflow-done-bg` | `hsl(142 76% 95%)` | Background concluído |
| `--workflow-blocked` | `hsl(0 72% 50%)` | Bloqueado / pendência crítica |
| `--workflow-blocked-bg` | `hsl(0 72% 95%)` | Background bloqueado |

### Confiança — Rastreabilidade (novo)

Cores para o sistema de fontes e evidências.

| Token CSS | Valor | Uso |
|---|---|---|
| `--confidence-source` | `hsl(210 85% 53%)` | Fato extraído de documento |
| `--confidence-source-bg` | `hsl(210 85% 95%)` | Background de citação de fonte |
| `--confidence-inference` | `hsl(38 92% 50%)` | Inferência / gerado pela IA |
| `--confidence-inference-bg` | `hsl(48 96% 95%)` | Background de inferência |
| `--confidence-alert` | `hsl(0 72% 50%)` | Requer revisão humana obrigatória |
| `--confidence-alert-bg` | `hsl(0 72% 95%)` | Background de alerta |
| `--confidence-verified` | `hsl(142 71% 36%)` | Revisado e aprovado pelo advogado |
| `--confidence-verified-bg` | `hsl(142 76% 95%)` | Background verificado |

---

## 4. Tokens Semânticos

### Light Mode

| Token | Valor HSL | Decisão |
|---|---|---|
| `--background` | `hsl(0 0% 100%)` | Branco puro — máxima legibilidade |
| `--foreground` | `hsl(252 25% 9%)` | Near-black c/ warm undertone (não preto frio) |
| `--primary` | `hsl(262 83% 57%)` | **Brand purple — não preto genérico** |
| `--primary-foreground` | `hsl(0 0% 100%)` | Branco sobre roxo |
| `--secondary` | `hsl(262 30% 95%)` | Lavanda muito suave |
| `--secondary-foreground` | `hsl(262 50% 28%)` | Roxo escuro legível |
| `--muted` | `hsl(262 15% 96%)` | Fundo de áreas inativas |
| `--muted-foreground` | `hsl(252 15% 45%)` | Texto secundário |
| `--accent` | `hsl(262 30% 93%)` | Hover em ghost buttons |
| `--border` | `hsl(262 20% 88%)` | Borda levemente lilás (não cinza frio) |
| `--ring` | `hsl(262 83% 57%)` | Focus ring = brand purple |
| `--sidebar-background` | `hsl(262 25% 97%)` | Painel com tint de marca |

#### Tokens de Layout (novo)

| Token | Valor HSL | Decisão |
|---|---|---|
| `--surface-workspace` | `hsl(262 15% 98%)` | Background do workspace do caso |
| `--surface-panel` | `hsl(0 0% 100%)` | Painéis flutuantes (fontes, metadados) |
| `--surface-artifact` | `hsl(0 0% 100%)` | Fundo do editor de artefato |
| `--surface-composer` | `hsl(0 0% 100%)` | Fundo do composer de chat |
| `--surface-sidebar-active` | `hsl(262 30% 93%)` | Item ativo na sidebar |
| `--border-subtle` | `hsl(262 15% 92%)` | Separadores entre painéis |
| `--border-split` | `hsl(262 20% 88%)` | Divisor do split-view (drag handle) |

### Dark Mode

| Token | Valor HSL | Decisão |
|---|---|---|
| `--background` | `hsl(256 32% 5%)` | **Roxo profundo** — não preto |
| `--foreground` | `hsl(262 15% 93%)` | Near-white c/ warmth |
| `--card` | `hsl(256 26% 8%)` | Elevado sobre background |
| `--primary` | `hsl(262 75% 67%)` | Roxo claro — contraste sobre escuro |
| `--border` | `hsl(256 22% 16%)` | Sutil, mantém hierarquia |
| `--sidebar-background` | `hsl(256 35% 4%)` | **Mais escuro que bg** → efeito recessed panel |

#### Tokens de Layout — Dark (novo)

| Token | Valor HSL | Decisão |
|---|---|---|
| `--surface-workspace` | `hsl(256 28% 6%)` | Background do workspace |
| `--surface-panel` | `hsl(256 26% 8%)` | Painéis flutuantes |
| `--surface-artifact` | `hsl(256 24% 9%)` | Fundo do editor de artefato |
| `--surface-composer` | `hsl(256 26% 8%)` | Fundo do composer |
| `--surface-sidebar-active` | `hsl(262 30% 12%)` | Item ativo na sidebar |
| `--border-subtle` | `hsl(256 20% 12%)` | Separadores entre painéis |
| `--border-split` | `hsl(256 22% 16%)` | Divisor do split-view |

---

## 5. Tipografia

### Fontes

| Família | Uso | CSS Var |
|---|---|---|
| **Geist** | Todo texto de interface | `--font-geist` |
| **Geist Mono** | Código, números técnicos, timestamps, números de processo | `--font-geist-mono` |

Geist (Vercel) foi escolhido por: excelente legibilidade em telas, suporte a PT-BR,
variável (weight dinâmico sem múltiplos arquivos), moderna mas não decorativa.

### Escala de Tamanhos

```
xs   = 12px  — labels, metadados, badges, timestamps
sm   = 14px  — body secundário, descrições, tooltips
base = 16px  — body principal, mensagens de chat
lg   = 18px  — body ênfase
xl   = 20px  — subtítulo de seção, card title
2xl  = 24px  — título de card, section header
3xl  = 30px  — título de página, nome do caso
4xl  = 36px  — headline
5xl  = 48px  — hero / landing
```

### Hierarquia em componentes

```
H1 (page title)     → 3xl, weight 700, tracking -0.025em
H2 (section)        → 2xl, weight 600, tracking -0.025em
H3 (card title)     → xl,  weight 600
H4 (subsection)     → lg,  weight 600
Body                → base, weight 400, leading 1.5
Body secondary      → sm,  weight 400, leading 1.5
Caption/Meta        → xs,  weight 500, muted-foreground
Code inline         → sm,  Geist Mono
Número de processo  → sm,  Geist Mono, muted-foreground
```

---

## 6. Espaçamento

Grid de **4px**. Use exclusivamente valores Tailwind (`p-4` = 16px, `gap-6` = 24px, etc.).

| Uso | Valor |
|---|---|
| Intra-componente (ícone + texto) | 8px (`gap-2`) |
| Padding de card pequeno | 16px (`p-4`) |
| Padding de card padrão | 24px (`p-6`) |
| Gap entre cards | 16px ou 24px |
| Margem de seção | 32px–48px |
| Container padding lateral (mobile) | 16px |
| Container padding lateral (desktop) | 24px–32px |
| Gap entre painéis do split-view | 1px (border) ou 8px (com handle) |
| Padding interno de painel lateral | 16px (`p-4`) |
| Padding do composer | 16px–24px |
| Padding do artifact editor | 32px–48px lateral (simula papel) |

---

## 7. Border Radius

| Classe | Valor | Uso |
|---|---|---|
| `rounded-xs` | 6px | Badges pequenos, chips, confidence tags |
| `rounded-sm` | 8px | Inputs, dropdowns |
| `rounded-md` | 10px | **Base** — botões, cards menores |
| `rounded-lg` | 12px | Cards padrão, modais, painéis |
| `rounded-xl` | 16px | Cards grandes, painéis de caso |
| `rounded-2xl` | 24px | Sheets, overlays maiores |
| `rounded-full` | 9999px | Avatares, pílulas de badge, status dots |

Base: `--radius: 0.625rem` (10px). Ligeiramente maior que o padrão shadcn (8px) — mais
moderno sem parecer "bubbly".

---

## 8. Sombras / Elevação

Sistema de 5 níveis. Sombras com undertone roxo (coerentes com a paleta).

| Classe | Uso |
|---|---|
| `shadow-xs` | Separação sutil (sidebar items, inputs) |
| `shadow-sm` | Cards em repouso, painéis base |
| `shadow-md` | Cards com hover, dropdowns, painéis flutuantes |
| `shadow-lg` | Modais, sidesheets, painel de fontes expandido |
| `shadow-xl` | Toasts, alertas flutuantes, command palette |
| `shadow-brand` | Glow de focus/hover em elementos de marca |
| `shadow-gold` | Glow em elementos gold / CTAs |

### Hierarquia de elevação no layout

```
z-0   — Background do workspace
z-10  — Sidebar, painéis fixos
z-20  — Cards de caso, artefatos
z-30  — Painéis flutuantes (fontes, metadados)
z-40  — Dropdowns, popovers, tooltips
z-50  — Modais, dialogs
z-60  — Command palette
z-70  — Toasts, notificações
```

---

## 9. Layout System

### 9.1 AppShell

O shell principal da aplicação. Tudo dentro dele.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Topbar Global (h-14, z-30)                                          │
├──────────┬───────────────────────────────────────────────────────────┤
│ Sidebar  │ Main Content Area                                        │
│ (w-64)   │                                                          │
│          │                                                          │
│          │                                                          │
│          │                                                          │
│          │                                                          │
│          │                                                          │
└──────────┴───────────────────────────────────────────────────────────┘
```

**Tokens de dimensão:**

| Elemento | Dimensão | Tailwind | Colapsado |
|---|---|---|---|
| Topbar | height: 56px | `h-14` | — |
| Sidebar | width: 256px | `w-64` | `w-16` (64px, ícones only) |
| Main content | `flex-1` | — | — |
| Min-width global | 1024px | `min-w-[1024px]` | — |

**Sidebar:**
- Estado expandido: logo + texto + ícones. `w-64`.
- Estado colapsado: apenas ícones e tooltips. `w-16`.
- Toggle via botão no topbar.
- Em mobile: overlay (sheet) com backdrop.

### 9.2 Workspace do Caso (Split-View)

Layout central quando o advogado está trabalhando dentro de um caso.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Case Header (nome do caso, nº processo, status, ações)              │
├────────────────────────────┬─────────────────────────────────────────┤
│ Painel Esquerdo            │ Painel Direito                         │
│ (Chat + Fluxos)            │ (Artifact / Editor)                    │
│                            │                                        │
│ ┌────────────────────────┐ │ ┌─────────────────────────────────────┐│
│ │ Chat contextual        │ │ │ Documento editável                 ││
│ │ ou                     │ │ │ com painel de fontes               ││
│ │ Fluxo guiado ativo     │ │ │                                    ││
│ │                        │ │ │                                    ││
│ │                        │ │ │                                    ││
│ ├────────────────────────┤ │ │                                    ││
│ │ Composer               │ │ │                                    ││
│ └────────────────────────┘ │ └─────────────────────────────────────┘│
└────────────────────────────┴─────────────────────────────────────────┘
```

**Proporções do split-view:**

| Estado | Esquerda | Direita | Quando |
|---|---|---|---|
| Chat dominante | 60% | 40% | Conversando, sem artefato aberto |
| Split equilibrado | 50% | 50% | Chat + artefato ativo |
| Artifact dominante | 35% | 65% | Revisando/editando peça |
| Artifact full | 0% | 100% | Modo foco de edição |
| Chat full | 100% | 0% | Sem artefato, interação livre |

- Divisor arrastável (`border-split`) entre painéis.
- Double-click no divisor → volta ao 50/50.
- Atalho de teclado para alternar modos.

### 9.3 Painel de Metadados (3ª Coluna)

Coluna retrátil à direita do workspace para contexto do processo.

```
┌────────────────────┬──────────────────────────┬─────────────┐
│ Chat / Fluxo       │ Artifact / Editor        │ Metadados   │
│                    │                          │ do Caso     │
│                    │                          │             │
│                    │                          │ - Nº proc.  │
│                    │                          │ - Tribunal  │
│                    │                          │ - Partes    │
│                    │                          │ - Teses     │
│                    │                          │ - Docs      │
│                    │                          │ - Timeline  │
└────────────────────┴──────────────────────────┴─────────────┘
```

| Elemento | Dimensão | Comportamento |
|---|---|---|
| Painel de metadados | `w-80` (320px) | Retrátil via toggle |
| Painel de fontes | `w-80` (320px) | Substitui metadados quando ativo |

Nunca exibir metadados E fontes simultaneamente — alternar entre eles.

### 9.4 Home / Casos

Layout da tela inicial. **Nunca abre em estado de chat vazio.**

```
┌──────────────────────────────────────────────────────────────┐
│ Header: Busca global + "Criar caso" + "Subir documentos"    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ [Seção: Continue de onde parou]                               │
│   CaseCard  CaseCard  CaseCard                               │
│                                                              │
│ [Seção: Fluxos rápidos]                                      │
│   FlowCard  FlowCard  FlowCard  FlowCard                    │
│                                                              │
│ [Seção: Todos os casos]                                      │
│   Lista ou grid de CaseCards com filtros                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Grid de cards:**

| Contexto | Colunas | Gap |
|---|---|---|
| Home — CaseCards | 3 em desktop, 2 em tablet, 1 em mobile | `gap-4` |
| Home — FlowCards | 4 em desktop, 2 em tablet, 1 em mobile | `gap-4` |
| Biblioteca de fluxos | 3 em desktop, 2 em tablet, 1 em mobile | `gap-6` |

---

## 10. Componentes Primitivos

### Button

```tsx
// Variantes disponíveis:
<Button variant="default">       // brand purple — ação primária
<Button variant="secondary">     // lavanda suave — ação secundária
<Button variant="outline">       // borda + transparente
<Button variant="outline-brand"> // borda purple, texto purple
<Button variant="ghost">         // sem borda, hover sutil
<Button variant="gold">          // dourado — CTA premium / destaque
<Button variant="destructive">   // vermelho — ações irreversíveis
<Button variant="link">          // texto com underline

// Tamanhos:
<Button size="sm">       // h-9, 36px
<Button size="default">  // h-10, 40px
<Button size="lg">       // h-11, 44px
<Button size="icon">     // 40×40px
<Button size="icon-sm">  // 32×32px
```

**Regras de uso:**
- Máximo 1 `default` (purple) por seção visual
- `gold` exclusivamente para ações de conversão / destaques únicos
- `destructive` sempre com confirmação (dialog)
- Ícone + texto: sempre `gap-2`, SVG com `size-4`

### Badge

```tsx
<Badge variant="default">       // purple
<Badge variant="secondary">     // lavanda
<Badge variant="brand">         // purple pill (estados de agente, categorias)
<Badge variant="gold">          // dourado (tier, destaque)
<Badge variant="success">       // verde
<Badge variant="warning">       // âmbar
<Badge variant="error">         // vermelho
<Badge variant="outline">       // só borda
<Badge variant="destructive">   // vermelho forte

// Novas variantes (v2.0):
<Badge variant="workflow-draft">    // rascunho
<Badge variant="workflow-active">   // em andamento
<Badge variant="workflow-review">   // aguardando revisão
<Badge variant="workflow-done">     // concluído
<Badge variant="workflow-blocked">  // bloqueado
<Badge variant="source">            // fonte de documento
<Badge variant="inference">         // inferência da IA
<Badge variant="needs-review">      // requer revisão humana
```

### Card

```tsx
<Card> // bg-card, rounded-lg, border, shadow-sm
  <CardHeader>
    <CardTitle />
    <CardDescription />
    <CardAction /> {/* ações no canto superior direito */}
  </CardHeader>
  <CardContent />
  <CardFooter />
</Card>
```

### Input / Textarea

Focus ring: `ring-ring` = brand purple. Altura padrão `h-10`. Border `border-input`.

---

## 11. Componentes Compostos

Componentes de domínio que compõem as telas principais do AssistJur.
Cada um usa exclusivamente tokens semânticos e componentes primitivos.

### 11.1 CaseCard

Card que representa um caso/processo na home e listas.

```tsx
<CaseCard>
  <CaseCardHeader>
    <CaseCardTitle />          {/* Nome do caso — H3 */}
    <CaseCardNumber />         {/* Nº do processo — Geist Mono, muted */}
    <WorkflowBadge />          {/* Status: rascunho | ativo | revisão | concluído */}
  </CaseCardHeader>
  <CaseCardMeta>
    <MetaItem icon={Scale} label="Vara" value="2ª Vara do Trabalho" />
    <MetaItem icon={Users} label="Partes" value="Fulano vs Empresa X" />
    <MetaItem icon={Clock} label="Atualizado" value="há 2 horas" />
  </CaseCardMeta>
  <CaseCardFooter>
    <CaseCardProgress />       {/* Barra de progresso do caso */}
    <CaseCardActions />        {/* Botões: Abrir, Menu */}
  </CaseCardFooter>
</CaseCard>
```

**Anatomia visual:**

| Elemento | Tipografia | Cor |
|---|---|---|
| Nome do caso | xl, weight 600 | `text-foreground` |
| Nº do processo | sm, Geist Mono | `text-muted-foreground` |
| Metadados | sm | `text-muted-foreground` |
| Badge de status | xs, weight 500 | Token de workflow correspondente |

**Dimensões:** min-width 280px, max-width 400px, padding `p-5`.

### 11.2 FlowCard

Card que representa um fluxo/tarefa jurídica guiada.

```tsx
<FlowCard>
  <FlowCardIcon />            {/* Ícone representativo — 40×40 com bg circle */}
  <FlowCardTitle />            {/* Verbo de ação: "Revisar defesa" — H4 */}
  <FlowCardDescription />      {/* 1-2 linhas descritivas — Body secondary */}
  <FlowCardMeta>
    <FlowInputs />             {/* "Requer: petição inicial, defesa" */}
    <FlowOutput />             {/* "Gera: relatório de revisão" */}
    <FlowEstimate />           {/* "~3 min" */}
  </FlowCardMeta>
  <FlowCardCTA />              {/* Botão: "Iniciar revisão" — outline-brand */}
</FlowCard>
```

**Regras de uso:**
- Títulos como **verbos de ação**, não substantivos. "Revisar defesa" em vez de "Revisor".
- Badges de área do direito: `<Badge variant="brand">Trabalhista</Badge>`.
- CTA específico ao fluxo: "Iniciar revisão", "Gerar contestação", "Extrair cronologia".
- Nunca "Usar agente" como CTA — abstrato demais.

**Dimensões:** min-width 240px, max-width 320px, padding `p-5`.

### 11.3 AgentCard

Card de agente para a grid de descoberta (home state, sem caso aberto).

```tsx
<AgentCard>
  <AgentCardAvatar />          {/* Ícone/avatar do agente — 48×48 */}
  <AgentCardName />            {/* Nome — H3 */}
  <AgentCardRole />            {/* "Analisa PDFs extensos" — Body secondary */}
  <AgentCardCapabilities>
    <CapabilityChip />         {/* "Revisão", "Extração", "Redação" */}
  </AgentCardCapabilities>
  <AgentCardCTA />             {/* outline-brand ou ghost */}
</AgentCard>
```

**Diferença entre FlowCard e AgentCard:**
- `FlowCard` = tarefa específica com input/output definidos. Aparece na Biblioteca de Fluxos e no workspace do caso.
- `AgentCard` = agente genérico com capacidades. Aparece na home como "catálogo", mas é secundário aos FlowCards.

### 11.4 PromptComposer

O compositor de chat — principal componente operacional.

```tsx
<PromptComposer>
  <ComposerContext>            {/* Faixa superior: "No caso: Ygor × CBD | Agente: Revisor" */}
    <ContextCaseBadge />
    <ContextAgentBadge />
    <ContextDocCount />        {/* "4 PDFs · 120 páginas" */}
  </ComposerContext>
  <ComposerInput>
    <TextareaAutosize />       {/* Campo principal — cresce com conteúdo */}
  </ComposerInput>
  <ComposerToolbar>
    <AttachButton />           {/* Anexar documento */}
    <ToolButton />             {/* Selecionar ferramenta */}
    <SuggestionChips />        {/* Sugestões rápidas clicáveis */}
    <AgentSelector />          {/* Dropdown do agente ativo */}
    <SendButton />             {/* brand purple, ícone Arrow */}
  </ComposerToolbar>
</PromptComposer>
```

**Regras de uso:**
- Placeholder específico ao contexto: "Descreva o caso, envie documentos ou peça uma minuta…"
- `ContextDocCount` atualiza em tempo real conforme documentos são processados.
- `SuggestionChips` mudam com base no agente ativo e estágio do caso.
- Background: `surface-composer`. Border: `border`. Shadow: `shadow-sm`.
- Altura mínima: 56px. Máxima: 200px (scrollable depois).

### 11.5 SourcePanel

Painel lateral de fontes e evidências.

```tsx
<SourcePanel>
  <SourcePanelHeader>
    <Title />                  {/* "Fontes e Evidências" — H4 */}
    <CloseButton />
  </SourcePanelHeader>
  <SourcePanelTabs>
    <Tab>Documentos</Tab>
    <Tab>Jurisprudência</Tab>
    <Tab>Legislação</Tab>
  </SourcePanelTabs>
  <SourceList>
    <SourceItem>
      <SourceIcon />           {/* Tipo: PDF, decisão, lei */}
      <SourceTitle />          {/* Nome do documento */}
      <SourcePage />           {/* "p. 47, §3" — Geist Mono */}
      <ConfidenceBadge />      {/* source | inference | needs-review */}
      <SourceExcerpt />        {/* Trecho relevante — max 3 linhas */}
    </SourceItem>
  </SourceList>
  <SourcePanelFooter>
    <SourceStats />            {/* "12 fontes · 3 inferências · 2 alertas" */}
  </SourcePanelFooter>
</SourcePanel>
```

**Regras de uso:**
- Width: `w-80` (320px), retrátil.
- Cada `SourceItem` deve ser clicável → abre o documento na posição exata.
- Badges de confiança: azul (fonte direta), âmbar (inferência), vermelho (requer revisão).
- Nunca esconder fontes atrás de mais de 1 clique.

### 11.6 ArtifactEditor

Editor de documento/peça jurídica em painel dedicado.

```tsx
<ArtifactEditor>
  <ArtifactToolbar>
    <ArtifactTitle />          {/* "Contestação — Caso Ygor × CBD" — H3 */}
    <VersionSelector />        {/* "v3 (atual)" dropdown */}
    <ArtifactActions>
      <ExportButton />         {/* Exportar .docx */}
      <CompareButton />        {/* Comparar versões */}
      <FullscreenButton />     {/* Modo foco */}
    </ArtifactActions>
  </ArtifactToolbar>
  <ArtifactBody>
    <Editor />                 {/* Rich text editor — ProseMirror ou similar */}
    <InlineAnnotations>
      <AIComment />            {/* Balão lateral da IA — confiança, sugestão */}
      <SourceHighlight />      {/* Trecho vinculado a fonte */}
      <ReviewFlag />           {/* Marcador "requer revisão" */}
    </InlineAnnotations>
  </ArtifactBody>
  <ArtifactFooter>
    <WordCount />
    <LastSaved />
    <ConfidenceSummary />      {/* "14 fontes · 2 inferências · 1 alerta" */}
  </ArtifactFooter>
</ArtifactEditor>
```

**Regras de uso:**
- Background: `surface-artifact`. Padding lateral generoso (`px-8` a `px-12`) para simular documento.
- `AIComment` renderiza na margem direita, alinhado ao parágrafo. Background: `confidence-inference-bg`.
- `SourceHighlight`: underline pontilhado azul. Hover → popover com dados da fonte.
- `ReviewFlag`: ícone âmbar na margem com tooltip. Clicável → abre SourcePanel filtrado.

### 11.7 CaseTimeline

Timeline visual de eventos do caso.

```tsx
<CaseTimeline>
  <TimelineItem>
    <TimelineDot status="done" />     {/* Cor do workflow */}
    <TimelineDate />                   {/* "12 mar 2025" — xs, Geist Mono */}
    <TimelineContent>
      <TimelineTitle />                {/* "Petição inicial recebida" */}
      <TimelineDescription />          {/* Detalhes opcionais */}
      <TimelineAttachments />          {/* Docs vinculados */}
    </TimelineContent>
  </TimelineItem>
  <TimelineConnector />                {/* Linha vertical entre items */}
</CaseTimeline>
```

**Regras de uso:**
- Orientação vertical, mais recente no topo.
- `TimelineDot` usa cores de workflow: `done` = verde, `active` = roxo, `review` = gold, `blocked` = vermelho.
- `TimelineConnector`: 2px, `border-subtle`.
- Clicável: cada item pode abrir o documento ou artefato associado.

### 11.8 CaseHeader

Cabeçalho persistente dentro do workspace do caso.

```tsx
<CaseHeader>
  <CaseHeaderLeft>
    <BackButton />                     {/* Voltar para Home / Casos */}
    <CaseTitle />                      {/* Nome — H2 */}
    <CaseNumber />                     {/* Nº processo — Geist Mono, muted */}
    <WorkflowBadge />
  </CaseHeaderLeft>
  <CaseHeaderRight>
    <CaseActions>
      <Button variant="outline-brand">Subir documentos</Button>
      <Button variant="default">Iniciar fluxo</Button>
      <MoreMenu />                     {/* Editar, Arquivar, Exportar */}
    </CaseActions>
  </CaseHeaderRight>
</CaseHeader>
```

**Dimensões:** height: 64px (`h-16`). Background: `surface-workspace`. Border-bottom: `border`.

### 11.9 UploadZone

Componente de upload de documentos com feedback ativo.

```tsx
<UploadZone>
  <DropArea>                           {/* Drag-and-drop zone */}
    <UploadIcon />
    <UploadTitle />                    {/* "Arraste documentos do processo" */}
    <UploadSubtitle />                 {/* "PDF, DOCX · Até 50MB" */}
    <UploadButton />                   {/* "Escolher arquivos" — outline */}
  </DropArea>
  <UploadList>
    <UploadItem>
      <FileIcon />
      <FileName />
      <FileSize />
      <ProcessingStatus />            {/* Barra de progresso ou ✓ */}
      <FileTypeTag />                  {/* Auto-detectado: "Petição inicial" */}
    </UploadItem>
  </UploadList>
  <UploadSuggestions>                  {/* Pós-upload: próximos passos */}
    <SuggestionChip>Resumir documentos</SuggestionChip>
    <SuggestionChip>Extrair cronologia</SuggestionChip>
    <SuggestionChip>Revisar defesa</SuggestionChip>
  </UploadSuggestions>
</UploadZone>
```

**Regras de uso:**
- Estado drag-over: border `border-primary`, bg `primary/5`.
- Após upload: nunca estado morto. Sempre mostrar `UploadSuggestions` com próximos passos.
- `FileTypeTag` sugere automaticamente o tipo de documento com opção de corrigir.

### 11.10 CommandPalette

Busca global / atalho rápido.

```tsx
<CommandPalette>               {/* Dialog central, shadow-xl */}
  <CommandInput />             {/* Busca — autofocus */}
  <CommandGroups>
    <CommandGroup title="Casos">
      <CommandItem />          {/* Caso + nº processo + status */}
    </CommandGroup>
    <CommandGroup title="Fluxos">
      <CommandItem />          {/* Nome do fluxo + ícone */}
    </CommandGroup>
    <CommandGroup title="Documentos">
      <CommandItem />          {/* Nome do doc + caso associado */}
    </CommandGroup>
    <CommandGroup title="Ações">
      <CommandItem />          {/* "Novo caso", "Subir documento" */}
    </CommandGroup>
  </CommandGroups>
</CommandPalette>
```

**Atalho:** `Cmd+K` / `Ctrl+K`.
**Dimensões:** max-width 640px, max-height 400px, centrado, shadow-xl, z-60.

### 11.11 SmartTemplate

Modal de fluxo guiado — substitui prompt livre por formulário contextual.

```tsx
<SmartTemplate>
  <TemplateHeader>
    <TemplateIcon />
    <TemplateTitle />              {/* "Gerar Contestação" */}
    <TemplateDescription />        {/* "Preencha os dados e o sistema gera o rascunho" */}
  </TemplateHeader>
  <TemplateForm>
    <TemplateField label="Valor da causa" type="currency" />
    <TemplateField label="Houve perícia?" type="boolean" />
    <TemplateField label="Teses principais" type="textarea" />
    <TemplateField label="Documentos" type="file-select" />
  </TemplateForm>
  <TemplateFooter>
    <Button variant="ghost">Cancelar</Button>
    <TemplateEstimate />           {/* "~4 min · Gera contestação em artifact" */}
    <Button variant="default">Gerar contestação</Button>
  </TemplateFooter>
</SmartTemplate>
```

**Regras de uso:**
- Nunca mais de 6 campos por template — mínimo viável para a IA agir.
- Campos opcionais visualmente distintos dos obrigatórios.
- Após submit: transição direta para workspace com artifact abrindo.

### 11.12 AgentStatus

Indicador de atividade do agente de IA.

```tsx
<AgentStatus>
  <AgentStatusDot />               {/* Animado quando ativo */}
  <AgentStatusLabel />             {/* "Revisor analisando 4 PDFs · 120 páginas" */}
  <AgentStatusProgress />          {/* Barra ou spinner — opcional */}
</AgentStatus>
```

**Estados visuais:**

| Estado | Dot | Label | Animação |
|---|---|---|---|
| Idle | `muted` | "Pronto" | Nenhuma |
| Processing | `brand purple` | "Analisando…" | `animate-pulse` no dot |
| Generating | `brand purple` | "Gerando contestação…" | Progress bar |
| Done | `workflow-done` | "Concluído" | Fade para idle após 3s |
| Error | `destructive` | "Erro — tentar novamente" | Nenhuma |

---

## 12. Padrões de Confiança

O sistema de confiança é um pilar da UX do AssistJur. Cada output jurídico deve comunicar
visualmente a origem e o grau de certeza das informações.

### 12.1 Tipos de confiança

| Tipo | Cor | Ícone | Significado |
|---|---|---|---|
| **Fonte direta** | `confidence-source` (azul) | `FileText` | Extraído literalmente de documento |
| **Inferência** | `confidence-inference` (âmbar) | `Sparkles` | Gerado pela IA com base no contexto |
| **Alerta** | `confidence-alert` (vermelho) | `AlertTriangle` | Requer conferência humana obrigatória |
| **Verificado** | `confidence-verified` (verde) | `CheckCircle` | Revisado e aprovado pelo advogado |

### 12.2 Aplicação no ArtifactEditor

Dentro do texto da peça gerada:

- **Trecho com fonte:** underline pontilhado azul. Hover → popover com documento, página e parágrafo de origem.
- **Trecho inferido:** highlight âmbar suave no background. Margem: ícone `Sparkles`.
- **Trecho com alerta:** highlight vermelho suave + ícone na margem. Click → SourcePanel filtrado.
- **Trecho verificado:** check discreto na margem após aprovação do advogado.

### 12.3 Aplicação no Chat

Mensagens do agente podem conter inline:

```tsx
<ChatMessage role="assistant">
  <p>
    O prazo para contestação vence em
    <SourceTag doc="Petição Inicial" page="3">15 dias úteis</SourceTag>,
    contados da
    <InferenceTag>data de juntada do AR</InferenceTag>.
    <ReviewAlert>Verificar se houve prorrogação por convenção coletiva.</ReviewAlert>
  </p>
</ChatMessage>
```

### 12.4 Resumo de confiança

Sempre que um artefato ou resposta longa é gerada, exibir resumo:

```tsx
<ConfidenceSummary>
  <ConfidenceCount type="source" count={14} />      {/* "14 fontes" */}
  <ConfidenceCount type="inference" count={3} />     {/* "3 inferências" */}
  <ConfidenceCount type="alert" count={1} />         {/* "1 alerta" */}
</ConfidenceSummary>
```

Posicionar no footer do `ArtifactEditor` e no final de respostas longas do chat.

---

## 13. Estados de Interação

| Estado | Implementação |
|---|---|
| **Default** | Conforme tokens base |
| **Hover** | `hover:bg-*/90` ou `hover:bg-accent` — explícito, sem ambiguidade |
| **Focus** | `focus-visible:ring-2 focus-visible:ring-ring` — anel roxo nítido |
| **Active** | `active:bg-*/95` — leve escurecimento para feedback tátil |
| **Disabled** | `opacity-50 pointer-events-none` — 50% opacity, sem cursor |
| **Loading** | Skeleton com `animate-pulse` + `bg-foreground/20` |
| **Error** | Border `border-destructive`, texto `text-destructive` |
| **Success** | Border `border-brand-success`, ícone verde |

### Estados adicionais (v2.0)

| Estado | Implementação |
|---|---|
| **Selected (sidebar)** | `bg-surface-sidebar-active`, `text-primary`, `font-medium` |
| **Drag-over (upload)** | `border-primary`, `bg-primary/5`, `ring-2 ring-primary/30` |
| **Processing (agent)** | `animate-pulse` no dot + label de progresso |
| **Generating** | Streaming text + cursor piscante + progress bar |
| **Split-resize** | Cursor `col-resize`, highlight na `border-split` |

---

## 14. Dark / Light Mode

**Ambos suportados.** Default: `light`.

- Toggle via `next-themes` com atributo `class` em `<html>`
- Script inline no `<head>` previne FOUC
- Theme color meta tag atualizado dinamicamente

**Guideline:**
- Light mode: UI de trabalho diurno — branco, limpo, bordas suaves
- Dark mode: Premium "noturno" — roxo profundo, não preto zinc

**Nunca use cores hardcoded** em componentes. Sempre `text-foreground`, `bg-card`, etc.
Para cores de marca, use `text-brand-purple-*` ou `text-primary`.

**Tokens de confiança e workflow** funcionam em ambos os modos — valores ajustados
automaticamente via CSS custom properties no seletor `.dark`.

---

## 15. Iconografia e Ilustração

### Biblioteca

**Lucide React** como fonte primária. Estilo: outline, 24×24 (default), stroke-width 1.5.

### Ícones por domínio

| Domínio | Ícones principais |
|---|---|
| Caso / Processo | `Briefcase`, `Scale`, `Gavel` |
| Documentos | `FileText`, `Files`, `Upload` |
| Chat / Agente | `MessageSquare`, `Bot`, `Sparkles` |
| Fluxos / Tarefas | `Workflow`, `ListChecks`, `Play` |
| Confiança | `ShieldCheck`, `AlertTriangle`, `CheckCircle` |
| Navegação | `Home`, `Search`, `Settings`, `ChevronRight` |
| Status | `Clock`, `Check`, `X`, `Loader` |

### Regras

- Em botões: `size-4` (16px), `gap-2` com texto.
- Em cards: `size-5` (20px) ou `size-6` (24px) para ícones principais.
- Em badges: `size-3` (12px).
- Cor: herda do texto pai (`currentColor`), nunca cor fixa.

---

## 16. Motion e Animação

### Princípio

Animações devem comunicar estado e direcionalidade. Nunca decorativas.

### Tokens de duração

| Token | Valor | Uso |
|---|---|---|
| `--duration-fast` | `100ms` | Hover, focus |
| `--duration-base` | `200ms` | Transições de estado, toggle |
| `--duration-slow` | `300ms` | Abertura de painel, expand/collapse |
| `--duration-slower` | `500ms` | Entrada de modal, overlay |

### Easing

`ease-out` para entradas. `ease-in` para saídas. `ease-in-out` para toggle.

### Animações recorrentes

| Componente | Animação |
|---|---|
| Sidebar collapse | Slide + fade, `duration-slow` |
| Split-view resize | Resize fluido sem animação (instant) |
| Modal / dialog | Scale-up + fade, `duration-slower` |
| Toast | Slide-in from right, `duration-slow` |
| Agent processing dot | `animate-pulse` |
| Skeleton loading | `animate-pulse`, `bg-foreground/20` |
| Command palette | Scale-up + fade, `duration-base` |
| Confidence highlight | Background fade-in, `duration-base` |

---

## 17. Responsividade

### Breakpoints

| Nome | Valor | Contexto |
|---|---|---|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet portrait |
| `lg` | 1024px | Tablet landscape / desktop pequeno |
| `xl` | 1280px | Desktop padrão |
| `2xl` | 1536px | Desktop grande |

### Comportamento por breakpoint

| Componente | < `lg` | `lg`–`xl` | > `xl` |
|---|---|---|---|
| Sidebar | Sheet overlay | Colapsada (`w-16`) | Expandida (`w-64`) |
| Split-view | Stack vertical (artifact abaixo do chat) | Split 50/50 | Split ajustável |
| Painel de metadados | Hidden (acesso via tab) | Hidden (acesso via toggle) | Visível (`w-80`) |
| Home grid | 1 coluna | 2 colunas | 3–4 colunas |
| Command palette | Fullscreen | Centered, 80% width | Centered, 640px |
| Composer | Full-width, fixo no bottom | Dentro do painel esquerdo | Dentro do painel esquerdo |

### Prioridade mobile

O AssistJur é desktop-first (advogados trabalham em telas grandes), mas mobile deve permitir:
- Consultar caso e status
- Ler artefato
- Enviar mensagem rápida no chat
- Ver fontes

Não é prioritário em mobile: editar artefatos, usar split-view completo, drag-and-drop de upload.

---

## 18. Guidelines de Consistência

### Hierarquia de uso de cores

```
1. Tokens semânticos (bg-background, text-foreground)     ← sempre preferir
2. Tokens de layout (bg-surface-workspace, border-split)  ← para estrutura
3. Tokens de workflow/confiança (workflow-active, etc.)    ← para estados de domínio
4. Tokens de marca via Tailwind (bg-brand-purple-100)     ← para elementos decorativos
5. Primitivos da marca (--assistjur-purple-600)            ← só em CSS global / animações
6. Valores hardcoded (#7c3aed)                             ← NUNCA em componentes
```

### Regras invioláveis

1. **`--primary` é roxo** — jamais sobrescreva para preto/cinza em componentes de produto.
2. **Gold é escasso** — máximo 1 elemento gold por viewport.
3. **Sidebar mais escura no dark** — preserva profundidade do layout.
4. **Focus ring sempre visível** — não remova outline/ring sem substituto.
5. **Seleção de texto usa cor de marca** — `::selection` definida no globals.css.
6. **Scrollbar consistente** — 6px, cor `var(--border)`, não customize por componente.
7. **Caso é a entidade principal** — toda tela dentro do workspace exibe o contexto do caso no header.
8. **Upload nunca é estado morto** — sempre seguido de sugestões de próximos passos.
9. **Fontes a 1 clique** — painel de fontes nunca escondido atrás de mais de 1 interação.
10. **Linguagem jurídica, não técnica** — labels em PT-BR jurídico, sem jargão de IA.

### Escala de responsabilidade dos arquivos

| Arquivo | O que define |
|---|---|
| `app/globals.css` | Todos os tokens CSS, utilidades globais, base layer |
| `lib/design-tokens.ts` | Mesmos valores para uso em JS/TS |
| `components/ui/button.tsx` | Variantes de botão com CVA |
| `components/ui/badge.tsx` | Variantes de badge com CVA (incl. workflow + confidence) |
| `components/ui/*.tsx` | Cada componente primitivo — só usa tokens |
| `components/case/*.tsx` | CaseCard, CaseHeader, CaseTimeline |
| `components/flow/*.tsx` | FlowCard, SmartTemplate |
| `components/artifact/*.tsx` | ArtifactEditor, InlineAnnotations |
| `components/source/*.tsx` | SourcePanel, SourceItem, ConfidenceBadge |
| `components/chat/*.tsx` | PromptComposer, ChatMessage, AgentStatus |
| `components/layout/*.tsx` | AppShell, SplitView, Sidebar |
| `docs/DESIGN-SYSTEM.md` | Este arquivo — fonte da verdade do design |

### Como adicionar uma nova variante de componente

```tsx
// 1. Adicione no cva() do componente
variant: {
  "minha-variante": "bg-brand-purple-100 text-brand-purple-800 hover:bg-brand-purple-200",
}

// 2. Use tokens — nunca valores hardcoded
// ✅ bg-brand-purple-100
// ❌ bg-[#ede9fe]

// 3. Suporte dark mode embutido via dark: prefix
"dark:bg-brand-purple-900/50 dark:text-brand-purple-300"
```

### Como adicionar uma nova cor ao sistema

```css
/* 1. Em globals.css — seção "Primitivos de marca" */
:root {
  --assistjur-minha-cor: #xxxxxx;
}

/* 2. No @theme block — para disponibilizar como classe Tailwind */
@theme {
  --color-brand-minha-cor: var(--assistjur-minha-cor);
}

/* 3. Em lib/design-tokens.ts — para uso em JS */
export const brand = {
  minhaCor: "#xxxxxx",
}
```

### Como adicionar um componente composto

```tsx
// 1. Criar em components/{domínio}/meu-componente.tsx
// 2. Usar APENAS primitivos do design system (Button, Badge, Card, etc.)
// 3. Usar APENAS tokens semânticos para cores/espaçamento
// 4. Documentar anatomia e regras neste DESIGN-SYSTEM.md
// 5. Nunca importar cores hardcoded ou estilos ad-hoc
```

---

## 19. Escalar o Produto

### Componentes a sistematizar (próximas fases)

**P1 — Muito importante:**
- `<DataTable>` — tabela jurídica com filtros, paginação, row actions
- `<DocumentViewer>` — visualização de PDF/DOCX com highlighting de fonte
- `<LegalHighlight>` — destaque de trecho jurídico com tooltip de contexto
- `<VersionDiff>` — comparação visual entre versões de artefato
- `<OnboardingFlow>` — wizard de primeiro acesso com caso-exemplo

**P2 — Expansão:**
- `<TestimonyMap>` — mapa de testemunhas com roteiro de perguntas
- `<ROIDashboard>` — painel de produtividade e valor gerado
- `<CollaborationPanel>` — atividade de membros do escritório no caso
- `<GovernanceLog>` — trilha de auditoria de ações da IA
- `<CustomFlowBuilder>` — construtor de fluxos personalizados

### Padrão de componente novo

```tsx
// components/{domínio}/meu-componente.tsx
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const componentVariants = cva(
  // base classes — sem cores hardcoded
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
