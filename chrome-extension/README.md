# AssistJur.IA — Chrome Extension (Copiloto Jurídico)

Plugin Chrome que funciona como um **copiloto jurídico** para advogados, integrando-se diretamente com sistemas judiciais (PJe, e-SAJ, eProc, Projudi) e a plataforma AssistJur.IA.

## O que faz

- **Lê a tela do tribunal**: Extrai automaticamente dados de processos do PJe, e-SAJ, eProc e outros sistemas
- **Analisa com IA**: Envia os dados para os agentes de IA da plataforma AssistJur
- **Entrega resultados**: Resumo estratégico, riscos, prazos e peças prontas diretamente no navegador

## Funcionalidades

### Extração automática de dados
- Número do processo, partes, classe processual, assuntos
- Movimentações e eventos processuais
- Texto completo da página (para análise por IA)

### Ações rápidas
- **Analisar Processo**: Resumo estratégico completo
- **Identificar Riscos**: Classificação por gravidade com estratégias de mitigação
- **Prazos**: Lista de prazos críticos e ações necessárias
- **Elaborar Contestação**: Gera contestação com linguagem formal e fundamentos legais

### Interface
- **Side Panel**: Chat completo ao lado da página do tribunal
- **Popup**: Ações rápidas com um clique
- **FAB (botão flutuante)**: Aparece automaticamente em páginas de tribunais
- **Menu de contexto**: Clique direito para analisar texto selecionado

## Sistemas suportados

| Sistema | Cobertura |
|---------|-----------|
| **PJe** | TRT, TRF, TJDFT, etc. |
| **e-SAJ** | TJSP e outros estados |
| **eProc** | TRF4, JF |
| **Projudi** | Diversos TJs |
| **CNJ** | Consultas públicas |

## Instalação (Modo Desenvolvedor)

### 1. Gerar os ícones

Abra `chrome-extension/icons/generate-icons.html` no Chrome e baixe os 3 tamanhos:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

Salve-os na pasta `chrome-extension/icons/`.

### 2. Carregar a extensão

1. Abra `chrome://extensions/` no Chrome
2. Ative o **Modo do desenvolvedor** (toggle no canto superior direito)
3. Clique em **"Carregar sem compactação"**
4. Selecione a pasta `chrome-extension/`

### 3. Configurar

1. Clique no ícone da extensão na barra do Chrome
2. Abra o **Copiloto** (side panel)
3. Insira a URL da sua instância AssistJur (ex.: `https://assistjur.vercel.app`)
4. Faça login com e-mail/senha ou entre como visitante

## Uso

### Analisar um processo

1. Navegue até um processo no PJe, e-SAJ ou outro sistema
2. Clique no **botão flutuante** (amarelo, canto inferior direito) ou use o popup
3. O copiloto extrai os dados e inicia a análise
4. Use as **ações rápidas** ou faça perguntas livres

### Analisar texto selecionado

1. Selecione qualquer texto jurídico na página
2. Clique com o botão direito → **"AssistJur.IA — Analisar texto selecionado"**
3. O copiloto abre automaticamente com a análise

## Arquitetura

```
chrome-extension/
├── manifest.json          # Manifest V3
├── popup.html             # Popup (ações rápidas)
├── sidepanel.html         # Side panel (chat completo)
├── scripts/
│   ├── background.js      # Service worker (API, auth, routing)
│   ├── content.js         # Content script (extração do DOM)
│   ├── sidepanel.js       # Controller do side panel
│   └── popup.js           # Controller do popup
├── styles/
│   ├── sidepanel.css      # Estilos do side panel
│   ├── popup.css          # Estilos do popup
│   └── content.css        # FAB injetado nas páginas
└── icons/
    ├── icon.svg           # Ícone fonte (SVG)
    ├── generate-icons.html # Gerador de PNGs
    ├── icon16.png         # 16x16 (gerar)
    ├── icon48.png         # 48x48 (gerar)
    └── icon128.png        # 128x128 (gerar)
```

### Fluxo de dados

```
Página do tribunal (PJe/e-SAJ/eProc)
  │
  ▼
Content Script (content.js)
  │ Extrai DOM → dados estruturados
  ▼
Background Worker (background.js)
  │ Gerencia auth + envia para API
  ▼
AssistJur API (/api/chat)
  │ Processa com agentes de IA (RAG + LLM)
  ▼
Side Panel (sidepanel.js)
  │ Renderiza resposta em streaming
  ▼
Advogado vê o resultado
```

## Desenvolvimento

### Requisitos
- Chrome 116+ (para Side Panel API)
- Instância AssistJur rodando (local ou Vercel)

### Debug
1. Abra `chrome://extensions/`
2. Clique em **"Service Worker"** para ver logs do background
3. Use DevTools na página para ver logs do content script
4. Clique com botão direito no side panel → **Inspecionar** para debug da UI

### Recarregar após alterações
1. Vá em `chrome://extensions/`
2. Clique no botão de **reload** na extensão
3. Recarregue a página do tribunal

## Próximos passos

- [ ] Gerar ícones PNG a partir do SVG/HTML
- [ ] Publicar na Chrome Web Store
- [ ] Adicionar suporte a upload de PDFs pela extensão
- [ ] Integrar com a base de conhecimento (RAG)
- [ ] Adicionar cache local para processos analisados
- [ ] Suporte a múltiplas abas/processos simultâneos
