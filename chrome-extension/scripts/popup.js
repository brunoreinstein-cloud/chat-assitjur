/**
 * AssistJur.IA — Popup Controller
 *
 * Quick actions popup when clicking the extension icon.
 */

const $ = (sel) => document.querySelector(sel);

const els = {
  statusDot: $('#popup-status-dot'),
  statusText: $('#popup-status-text'),
  pageInfo: $('#popup-page-info'),
  systemName: $('#popup-system-name'),
  processNumber: $('#popup-process-number'),
  btnOpenPanel: $('#btn-open-panel'),
  btnAnalyze: $('#btn-analyze'),
  btnWebapp: $('#btn-webapp'),
  setupHint: $('#popup-setup-hint'),
  btnSetup: $('#btn-setup'),
};

function sendBg(type, data = {}) {
  return chrome.runtime.sendMessage({ type, ...data });
}

function setStatus(state, text) {
  els.statusDot.className = `status-dot status-${state}`;
  els.statusText.textContent = text;
}

async function init() {
  // Check config
  const { config } = await sendBg('GET_CONFIG');
  if (!config?.apiBaseUrl) {
    setStatus('disconnected', 'Não configurado');
    els.setupHint.style.display = 'block';
    els.btnOpenPanel.disabled = true;
    els.btnAnalyze.disabled = true;
    return;
  }

  // Check auth
  const auth = await sendBg('CHECK_AUTH');
  if (auth?.authenticated) {
    setStatus('connected', 'Conectado');
  } else {
    setStatus('disconnected', 'Não autenticado');
  }

  // Check if current page has process data
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' }, (response) => {
        if (chrome.runtime.lastError || !response?.success) return;

        const info = response.info;
        if (info.system !== 'Sistema Judicial' || info.hasProcess) {
          els.pageInfo.style.display = 'flex';
          els.systemName.textContent = info.system;
          els.processNumber.textContent = info.hasProcess ? 'Processo detectado' : info.title;
        }
      });
    }
  } catch {
    // Content script not available
  }

  // Set webapp URL
  els.btnWebapp.addEventListener('click', () => {
    chrome.tabs.create({ url: config.apiBaseUrl + '/chat' });
    window.close();
  });
}

// Event listeners
els.btnOpenPanel.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
  window.close();
});

els.btnAnalyze.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
    // Send analysis request after panel opens
    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PROCESS' }, (response) => {
        if (response?.success) {
          chrome.runtime.sendMessage({ type: 'ANALYZE_PROCESS', data: response.data });
        }
      });
    }, 800);
  }
  window.close();
});

els.btnSetup?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
  window.close();
});

init();
