/**
 * AssistJur.IA — Side Panel Controller
 *
 * Manages the side panel UI: screens, chat messages, quick actions, and
 * communication with the background service worker.
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentChatId = null;
let messages = [];
let isStreaming = false;
let extractedProcessData = null;

// ---------------------------------------------------------------------------
// DOM elements
// ---------------------------------------------------------------------------

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  screenSetup: $('#screen-setup'),
  screenLogin: $('#screen-login'),
  screenChat: $('#screen-chat'),
  inputApiUrl: $('#input-api-url'),
  btnSaveConfig: $('#btn-save-config'),
  setupError: $('#setup-error'),
  inputEmail: $('#input-email'),
  inputPassword: $('#input-password'),
  btnLogin: $('#btn-login'),
  btnGuest: $('#btn-guest'),
  loginError: $('#login-error'),
  messagesContainer: $('#messages'),
  inputMessage: $('#input-message'),
  btnSend: $('#btn-send'),
  btnExtract: $('#btn-extract'),
  btnNewChat: $('#btn-new-chat'),
  btnSettings: $('#btn-settings'),
  statusIndicator: $('#status-indicator'),
  statusText: $('#status-text'),
};

// ---------------------------------------------------------------------------
// Screen management
// ---------------------------------------------------------------------------

function showScreen(screen) {
  els.screenSetup.style.display = 'none';
  els.screenLogin.style.display = 'none';
  els.screenChat.style.display = 'none';
  screen.style.display = 'flex';
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

async function init() {
  const { success, config } = await sendBg('GET_CONFIG');
  if (!success || !config?.apiBaseUrl) {
    showScreen(els.screenSetup);
    return;
  }

  els.inputApiUrl.value = config.apiBaseUrl;

  // Check auth
  const auth = await sendBg('CHECK_AUTH');
  if (auth?.authenticated) {
    showScreen(els.screenChat);
    setStatus('connected', 'Conectado');
  } else {
    showScreen(els.screenLogin);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendBg(type, data = {}) {
  return chrome.runtime.sendMessage({ type, ...data });
}

function generateId() {
  return crypto.randomUUID?.() || Math.random().toString(36).slice(2, 15);
}

function setStatus(state, text) {
  els.statusIndicator.className = `status-dot status-${state}`;
  els.statusText.textContent = text;
}

function showError(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}

function hideError(el) {
  el.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderMarkdown(text) {
  // Simple markdown: bold, italic, headers, lists, code blocks
  return text
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n/g, '<br/>');
}

function addMessage(role, content) {
  messages.push({ role, content });

  // Remove welcome message
  const welcome = els.messagesContainer.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  const msgEl = document.createElement('div');
  msgEl.className = `message message-${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  if (role === 'user') {
    bubble.textContent = content;
  } else {
    bubble.innerHTML = renderMarkdown(content);
  }

  msgEl.appendChild(bubble);
  els.messagesContainer.appendChild(msgEl);
  els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;

  return bubble;
}

function addStreamingMessage() {
  const welcome = els.messagesContainer.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  const msgEl = document.createElement('div');
  msgEl.className = 'message message-assistant';
  msgEl.id = 'streaming-message';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  const cursor = document.createElement('span');
  cursor.className = 'typing-cursor';
  bubble.appendChild(cursor);

  msgEl.appendChild(bubble);
  els.messagesContainer.appendChild(msgEl);
  els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;

  return bubble;
}

function updateStreamingMessage(content) {
  const msgEl = document.getElementById('streaming-message');
  if (!msgEl) return;

  const bubble = msgEl.querySelector('.message-bubble');
  if (bubble) {
    bubble.innerHTML = renderMarkdown(content) + '<span class="typing-cursor"></span>';
    els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;
  }
}

function finalizeStreamingMessage(content) {
  const msgEl = document.getElementById('streaming-message');
  if (!msgEl) return;

  msgEl.removeAttribute('id');
  const bubble = msgEl.querySelector('.message-bubble');
  if (bubble) {
    bubble.innerHTML = renderMarkdown(content);
  }

  messages.push({ role: 'assistant', content });
}

// ---------------------------------------------------------------------------
// Chat logic
// ---------------------------------------------------------------------------

async function sendMessage(userMessage) {
  if (isStreaming || !userMessage.trim()) return;

  isStreaming = true;
  setStatus('streaming', 'Processando...');
  els.btnSend.disabled = true;

  addMessage('user', userMessage);
  els.inputMessage.value = '';
  autoResizeInput();

  if (!currentChatId) {
    currentChatId = generateId();
  }

  // Build messages for the API
  const apiMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Add process context if available
  if (extractedProcessData && messages.length <= 2) {
    const contextMsg = `[CONTEXTO DO PROCESSO EXTRAÍDO DA PÁGINA]\n\nSistema: ${extractedProcessData.sistemaDetectado}\nURL: ${extractedProcessData.url}\n\nDados extraídos:\n${JSON.stringify(extractedProcessData.campos, null, 2)}\n\nTexto da página (primeiros 50.000 caracteres):\n${extractedProcessData.textoCompleto?.slice(0, 50000) || 'N/A'}`;

    // Prepend context to first user message
    apiMessages[0] = {
      ...apiMessages[0],
      content: contextMsg + '\n\n---\n\nPedido do advogado: ' + apiMessages[0].content,
    };
  }

  const streamBubble = addStreamingMessage();
  let fullResponse = '';

  // Send to background
  await sendBg('SEND_CHAT', {
    chatId: currentChatId,
    messages: apiMessages,
  });
}

// Handle streaming chunks from background
chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'CHAT_CHUNK': {
      // Parse the streaming data
      const line = message.chunk;
      if (line.startsWith('0:')) {
        // Text chunk from AI SDK stream
        try {
          const text = JSON.parse(line.slice(2));
          if (typeof text === 'string') {
            fullResponseBuffer = (fullResponseBuffer || '') + text;
            updateStreamingMessage(fullResponseBuffer);
          }
        } catch {
          // Not JSON text, might be other format
        }
      }
      break;
    }

    case 'CHAT_DONE': {
      finalizeStreamingMessage(fullResponseBuffer || '');
      fullResponseBuffer = '';
      isStreaming = false;
      setStatus('connected', 'Conectado');
      els.btnSend.disabled = false;
      break;
    }

    case 'CHAT_ERROR': {
      const errorMsg = message.error || 'Erro ao processar mensagem';
      finalizeStreamingMessage(`Erro: ${errorMsg}`);
      fullResponseBuffer = '';
      isStreaming = false;
      setStatus('error', 'Erro');
      els.btnSend.disabled = false;
      setTimeout(() => setStatus('connected', 'Conectado'), 3000);
      break;
    }

    case 'ANALYZE_TEXT': {
      extractedProcessData = null;
      sendMessage(
        `Analise o seguinte texto jurídico extraído da página (${message.url}):\n\n"${message.text}"\n\nIdentifique: pedidos, prazos críticos, riscos para a parte ré e possíveis estratégias de defesa.`
      );
      break;
    }

    case 'ANALYZE_PROCESS': {
      extractedProcessData = message.data;
      sendMessage(
        'Analise este processo trabalhista. Identifique pedidos, prazos críticos e os principais riscos para a parte ré.'
      );
      break;
    }
  }
});

let fullResponseBuffer = '';

// ---------------------------------------------------------------------------
// Quick actions
// ---------------------------------------------------------------------------

const QUICK_ACTION_PROMPTS = {
  analyze:
    'Analise este processo trabalhista. Identifique pedidos, prazos críticos e os principais riscos para a parte ré. Faça um resumo estratégico.',
  risks:
    'Identifique todos os riscos jurídicos neste processo. Classifique cada risco por gravidade (alto, médio, baixo) e sugira estratégias de mitigação.',
  deadlines:
    'Liste todos os prazos processuais relevantes deste processo. Indique quais estão próximos do vencimento e quais ações precisam ser tomadas.',
  contest:
    'Com base nessa análise, elabore uma contestação completa, com linguagem formal e fundamentos no CLT e na jurisprudência do TST.',
};

async function handleQuickAction(action) {
  // First extract the process data
  setStatus('extracting', 'Extraindo dados...');

  const response = await sendBg('EXTRACT_FROM_TAB');

  if (response?.success && response?.data) {
    extractedProcessData = response.data;

    // Add context notification
    const systemNotice = document.createElement('div');
    systemNotice.className = 'system-notice';
    systemNotice.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      Dados extraídos do ${response.data.sistemaDetectado} — ${response.data.campos?.numeroProcesso || 'processo detectado'}
    `;
    const welcome = els.messagesContainer.querySelector('.welcome-message');
    if (welcome) welcome.remove();
    els.messagesContainer.appendChild(systemNotice);

    // Send the prompt
    sendMessage(QUICK_ACTION_PROMPTS[action]);
  } else {
    setStatus('error', 'Erro na extração');
    addMessage(
      'assistant',
      'Não foi possível extrair dados desta página. Verifique se você está em uma página de processo judicial (PJe, e-SAJ, eProc, etc.).'
    );
    setTimeout(() => setStatus('connected', 'Conectado'), 3000);
  }
}

// ---------------------------------------------------------------------------
// Input auto-resize
// ---------------------------------------------------------------------------

function autoResizeInput() {
  const input = els.inputMessage;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

// Setup screen
els.btnSaveConfig.addEventListener('click', async () => {
  const url = els.inputApiUrl.value.trim().replace(/\/+$/, '');
  if (!url) {
    showError(els.setupError, 'Insira a URL da API');
    return;
  }

  hideError(els.setupError);
  els.btnSaveConfig.disabled = true;
  els.btnSaveConfig.textContent = 'Conectando...';

  try {
    await sendBg('SET_CONFIG', { config: { apiBaseUrl: url } });

    // Test connection
    const auth = await sendBg('CHECK_AUTH');
    if (auth?.authenticated) {
      showScreen(els.screenChat);
      setStatus('connected', 'Conectado');
    } else {
      showScreen(els.screenLogin);
    }
  } catch (err) {
    showError(els.setupError, 'Erro ao conectar: ' + err.message);
  } finally {
    els.btnSaveConfig.disabled = false;
    els.btnSaveConfig.textContent = 'Salvar e Conectar';
  }
});

// Login screen
els.btnLogin.addEventListener('click', async () => {
  const email = els.inputEmail.value.trim();
  const password = els.inputPassword.value;

  if (!email || !password) {
    showError(els.loginError, 'Preencha e-mail e senha');
    return;
  }

  hideError(els.loginError);
  els.btnLogin.disabled = true;
  els.btnLogin.textContent = 'Entrando...';

  try {
    const result = await sendBg('LOGIN', { email, password });
    if (result?.success && result?.session) {
      showScreen(els.screenChat);
      setStatus('connected', 'Conectado');
    } else {
      showError(els.loginError, 'Credenciais inválidas');
    }
  } catch (err) {
    showError(els.loginError, err.message);
  } finally {
    els.btnLogin.disabled = false;
    els.btnLogin.textContent = 'Entrar';
  }
});

els.btnGuest.addEventListener('click', async () => {
  hideError(els.loginError);
  els.btnGuest.disabled = true;
  els.btnGuest.textContent = 'Entrando...';

  try {
    const result = await sendBg('LOGIN_GUEST');
    if (result?.success) {
      showScreen(els.screenChat);
      setStatus('connected', 'Conectado');
    } else {
      showError(els.loginError, 'Falha ao criar sessão de visitante');
    }
  } catch (err) {
    showError(els.loginError, err.message);
  } finally {
    els.btnGuest.disabled = false;
    els.btnGuest.textContent = 'Entrar como Visitante';
  }
});

// Chat input
els.inputMessage.addEventListener('input', autoResizeInput);
els.inputMessage.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(els.inputMessage.value);
  }
});

els.btnSend.addEventListener('click', () => {
  sendMessage(els.inputMessage.value);
});

// Header buttons
els.btnExtract.addEventListener('click', async () => {
  const response = await sendBg('EXTRACT_FROM_TAB');
  if (response?.success && response?.data) {
    extractedProcessData = response.data;

    const systemNotice = document.createElement('div');
    systemNotice.className = 'system-notice';
    systemNotice.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      Contexto carregado: ${response.data.sistemaDetectado} — ${response.data.campos?.numeroProcesso || 'processo detectado'}
    `;
    els.messagesContainer.appendChild(systemNotice);
    els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;
  }
});

els.btnNewChat.addEventListener('click', () => {
  currentChatId = null;
  messages = [];
  extractedProcessData = null;
  fullResponseBuffer = '';
  isStreaming = false;

  els.messagesContainer.innerHTML = `
    <div class="welcome-message">
      <div class="welcome-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
          <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
          <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
          <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>
        </svg>
      </div>
      <h3>Copiloto Jurídico</h3>
      <p>Navegue até um processo no PJe, e-SAJ ou outro sistema judicial e clique em <strong>"Analisar Processo"</strong> para começar.</p>
      <p class="welcome-hint">Você também pode selecionar texto na página e clicar com o botão direito para analisar.</p>
    </div>
  `;

  setStatus('connected', 'Conectado');
  els.btnSend.disabled = false;
});

els.btnSettings.addEventListener('click', () => {
  showScreen(els.screenSetup);
});

// Quick action buttons
$$('.quick-action').forEach((btn) => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    if (action && QUICK_ACTION_PROMPTS[action]) {
      handleQuickAction(action);
    }
  });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

init();
