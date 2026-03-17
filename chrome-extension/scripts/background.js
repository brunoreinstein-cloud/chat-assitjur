/**
 * AssistJur.IA — Background Service Worker
 *
 * Handles communication between the content script, side panel, and the
 * AssistJur API. Manages authentication, streaming chat, and context menus.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONFIG_DEFAULTS = {
  apiBaseUrl: '',  // Must be configured by user (e.g. https://assistjur.vercel.app)
  agentId: 'assistjur-master',
};

async function getConfig() {
  const stored = await chrome.storage.sync.get(['apiBaseUrl', 'agentId', 'sessionCookie']);
  return { ...CONFIG_DEFAULTS, ...stored };
}

async function setConfig(updates) {
  await chrome.storage.sync.set(updates);
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/** Attempt to get session info from the API */
async function getSession(apiBaseUrl) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/auth/session`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const session = await res.json();
    return session?.user ? session : null;
  } catch {
    return null;
  }
}

/** Login with email and password */
async function login(apiBaseUrl, email, password) {
  const csrfRes = await fetch(`${apiBaseUrl}/api/auth/csrf`, {
    credentials: 'include',
  });
  const { csrfToken } = await csrfRes.json();

  const res = await fetch(`${apiBaseUrl}/api/auth/callback/credentials`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      redirect: 'false',
    }),
  });

  if (!res.ok) {
    throw new Error('Credenciais inválidas');
  }

  return getSession(apiBaseUrl);
}

/** Login as guest */
async function loginGuest(apiBaseUrl) {
  const res = await fetch(`${apiBaseUrl}/api/auth/guest`, {
    method: 'POST',
    credentials: 'include',
    redirect: 'manual',
  });

  // Guest login redirects on success
  if (res.type === 'opaqueredirect' || res.status >= 300) {
    return getSession(apiBaseUrl);
  }

  if (!res.ok) {
    throw new Error('Falha ao criar sessão de visitante');
  }

  return getSession(apiBaseUrl);
}

// ---------------------------------------------------------------------------
// Chat API
// ---------------------------------------------------------------------------

/**
 * Send a message to the AssistJur chat API and stream the response.
 * Sends chunks back via the provided callback.
 */
async function sendChatMessage({ apiBaseUrl, chatId, agentId, messages, onChunk, onDone, onError }) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: chatId,
        agentId: agentId || CONFIG_DEFAULTS.agentId,
        selectedChatModel: 'chat-model-large',
        messages,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      onError?.(new Error(`API error ${res.status}: ${errorText}`));
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      onError?.(new Error('No response body'));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          onChunk?.(line);
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      onChunk?.(buffer);
    }

    onDone?.();
  } catch (error) {
    onError?.(error);
  }
}

// ---------------------------------------------------------------------------
// Context menus
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'assistjur-analyze',
    title: 'AssistJur.IA — Analisar texto selecionado',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'assistjur-analyze-page',
    title: 'AssistJur.IA — Analisar esta página',
    contexts: ['page'],
  });

  // Open side panel by default on install
  chrome.sidePanel?.setOptions?.({
    enabled: true,
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  // Open the side panel first
  await chrome.sidePanel.open({ tabId: tab.id });

  // Small delay to let the side panel load
  setTimeout(() => {
    if (info.menuItemId === 'assistjur-analyze' && info.selectionText) {
      chrome.runtime.sendMessage({
        type: 'ANALYZE_TEXT',
        text: info.selectionText,
        url: tab.url,
      });
    } else if (info.menuItemId === 'assistjur-analyze-page') {
      chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PROCESS' }, (response) => {
        if (response?.success) {
          chrome.runtime.sendMessage({
            type: 'ANALYZE_PROCESS',
            data: response.data,
          });
        }
      });
    }
  }, 500);
});

// ---------------------------------------------------------------------------
// Message routing
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((err) => {
    sendResponse({ success: false, error: err.message });
  });
  return true; // Async response
});

async function handleMessage(message, sender) {
  const config = await getConfig();

  switch (message.type) {
    // -- Config --
    case 'GET_CONFIG':
      return { success: true, config };

    case 'SET_CONFIG':
      await setConfig(message.config);
      return { success: true };

    // -- Auth --
    case 'CHECK_AUTH': {
      if (!config.apiBaseUrl) return { success: false, error: 'API URL não configurada' };
      const session = await getSession(config.apiBaseUrl);
      return { success: true, authenticated: !!session, session };
    }

    case 'LOGIN': {
      if (!config.apiBaseUrl) return { success: false, error: 'API URL não configurada' };
      const session = await login(config.apiBaseUrl, message.email, message.password);
      return { success: true, session };
    }

    case 'LOGIN_GUEST': {
      if (!config.apiBaseUrl) return { success: false, error: 'API URL não configurada' };
      const session = await loginGuest(config.apiBaseUrl);
      return { success: true, session };
    }

    // -- Chat --
    case 'SEND_CHAT': {
      if (!config.apiBaseUrl) return { success: false, error: 'API URL não configurada' };

      const port = message._portName;
      // For streaming, we use a different approach - send via port
      sendChatMessage({
        apiBaseUrl: config.apiBaseUrl,
        chatId: message.chatId,
        agentId: message.agentId || config.agentId,
        messages: message.messages,
        onChunk: (chunk) => {
          chrome.runtime.sendMessage({ type: 'CHAT_CHUNK', chunk }).catch(() => {});
        },
        onDone: () => {
          chrome.runtime.sendMessage({ type: 'CHAT_DONE' }).catch(() => {});
        },
        onError: (err) => {
          chrome.runtime.sendMessage({ type: 'CHAT_ERROR', error: err.message }).catch(() => {});
        },
      });

      return { success: true, streaming: true };
    }

    // -- Content extraction --
    case 'EXTRACT_FROM_TAB': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { success: false, error: 'Nenhuma aba ativa' };

      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PROCESS' }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error: 'Content script não está carregado nesta página. Navegue para um sistema judicial.',
            });
          } else {
            resolve(response);
          }
        });
      });
    }

    // -- Side panel --
    case 'OPEN_SIDEPANEL': {
      const tabId = sender?.tab?.id;
      if (tabId) {
        await chrome.sidePanel.open({ tabId });
      }
      return { success: true };
    }

    case 'CONTENT_SCRIPT_READY':
      return { success: true };

    default:
      return { success: false, error: `Tipo de mensagem desconhecido: ${message.type}` };
  }
}

// ---------------------------------------------------------------------------
// Side panel behavior — open on action click
// ---------------------------------------------------------------------------

chrome.action.onClicked?.addListener?.((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});
