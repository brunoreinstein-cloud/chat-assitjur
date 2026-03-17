/**
 * AssistJur.IA — Content Script
 *
 * Injected into court system pages (PJe, e-SAJ, TRT, eProc, Projudi).
 * Reads the DOM, extracts process data, and communicates with the background
 * service worker via chrome.runtime messages.
 */

// ---------------------------------------------------------------------------
// Court system detectors
// ---------------------------------------------------------------------------

const COURT_SYSTEMS = {
  PJE: {
    name: 'PJe',
    detect: () =>
      location.hostname.includes('pje') ||
      document.querySelector('#j_id_jsp_') !== null ||
      document.querySelector('[id*="pje"]') !== null,
  },
  ESAJ: {
    name: 'e-SAJ',
    detect: () =>
      location.hostname.includes('esaj') ||
      location.hostname.includes('consultasaj'),
  },
  EPROC: {
    name: 'eProc',
    detect: () => location.hostname.includes('eproc'),
  },
  PROJUDI: {
    name: 'Projudi',
    detect: () => location.hostname.includes('projudi'),
  },
  CNJ: {
    name: 'CNJ',
    detect: () => location.hostname.includes('cnj.jus.br'),
  },
};

function detectCourtSystem() {
  for (const [key, system] of Object.entries(COURT_SYSTEMS)) {
    if (system.detect()) return { key, name: system.name };
  }
  return { key: 'UNKNOWN', name: 'Sistema Judicial' };
}

// ---------------------------------------------------------------------------
// Data extractors per system
// ---------------------------------------------------------------------------

function extractPJeData() {
  const data = { sistema: 'PJe', campos: {} };

  // Process number
  const numProcesso =
    document.querySelector('.numProcesso')?.textContent?.trim() ||
    document.querySelector('[id*="numProcesso"]')?.textContent?.trim() ||
    document.querySelector('.processo-rotulo')?.textContent?.trim();
  if (numProcesso) data.campos.numeroProcesso = numProcesso;

  // Parties
  const parties = [];
  document.querySelectorAll('.nomePartes, .parte-nome, [class*="parte"]').forEach((el) => {
    const text = el.textContent?.trim();
    if (text && text.length > 2) parties.push(text);
  });
  if (parties.length) data.campos.partes = parties;

  // Judge
  const juiz =
    document.querySelector('.nomeOrgaoJulgador')?.textContent?.trim() ||
    document.querySelector('[id*="juiz"]')?.textContent?.trim();
  if (juiz) data.campos.orgaoJulgador = juiz;

  // Subject/class
  const classe =
    document.querySelector('.classeProcessual')?.textContent?.trim() ||
    document.querySelector('[id*="classe"]')?.textContent?.trim();
  if (classe) data.campos.classe = classe;

  const assunto =
    document.querySelector('.assuntoProcessual')?.textContent?.trim() ||
    document.querySelector('[id*="assunto"]')?.textContent?.trim();
  if (assunto) data.campos.assunto = assunto;

  // Movimentações (timeline)
  const movs = [];
  document
    .querySelectorAll(
      '.movimentacao, .linha-movimentacao, [class*="movimentac"], tr[id*="movimentac"]'
    )
    .forEach((el) => {
      const text = el.textContent?.trim();
      if (text && text.length > 5) movs.push(text.slice(0, 500));
    });
  if (movs.length) data.campos.movimentacoes = movs.slice(0, 30);

  // Full page text (fallback / complementary)
  data.textoCompleto = getVisibleText();

  return data;
}

function extractESAJData() {
  const data = { sistema: 'e-SAJ', campos: {} };

  const numProcesso =
    document.querySelector('#numeroProcesso')?.value ||
    document.querySelector('.nuProcesso')?.textContent?.trim() ||
    document.querySelector('[id*="numProc"]')?.textContent?.trim();
  if (numProcesso) data.campos.numeroProcesso = numProcesso;

  // Table rows with label : value
  document.querySelectorAll('table.secaoFormBody tr, .unj-entity-header__summary tr').forEach((tr) => {
    const label = tr.querySelector('td:first-child, th')?.textContent?.trim();
    const value = tr.querySelector('td:last-child')?.textContent?.trim();
    if (label && value && label !== value) {
      const key = label.replace(/[:\s]+$/g, '').toLowerCase().replace(/\s+/g, '_');
      data.campos[key] = value;
    }
  });

  // Movimentações
  const movs = [];
  document.querySelectorAll('.movimentacao, #tabelaUltimasMovimentacoes tr, .containerMovimentacao').forEach((el) => {
    const text = el.textContent?.trim();
    if (text && text.length > 5) movs.push(text.slice(0, 500));
  });
  if (movs.length) data.campos.movimentacoes = movs.slice(0, 30);

  data.textoCompleto = getVisibleText();
  return data;
}

function extractEProcData() {
  const data = { sistema: 'eProc', campos: {} };

  const numProcesso =
    document.querySelector('#txtNumProcesso')?.textContent?.trim() ||
    document.querySelector('.infraNomeProcesso')?.textContent?.trim();
  if (numProcesso) data.campos.numeroProcesso = numProcesso;

  // Extract table data
  document.querySelectorAll('table.infraTable tr, #fldDados tr').forEach((tr) => {
    const tds = tr.querySelectorAll('td');
    if (tds.length >= 2) {
      const label = tds[0].textContent?.trim();
      const value = tds[1].textContent?.trim();
      if (label && value) {
        const key = label.replace(/[:\s]+$/g, '').toLowerCase().replace(/\s+/g, '_');
        data.campos[key] = value;
      }
    }
  });

  // Events
  const events = [];
  document.querySelectorAll('.infraEventoDescricao, .evento').forEach((el) => {
    const text = el.textContent?.trim();
    if (text) events.push(text.slice(0, 500));
  });
  if (events.length) data.campos.eventos = events.slice(0, 30);

  data.textoCompleto = getVisibleText();
  return data;
}

function extractGenericData() {
  const data = { sistema: 'Genérico', campos: {} };

  // Try common patterns
  const numPatterns = [
    /\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/g, // CNJ pattern
  ];
  const pageText = document.body.innerText;
  for (const pattern of numPatterns) {
    const matches = pageText.match(pattern);
    if (matches?.length) {
      data.campos.numerosProcesso = [...new Set(matches)];
      break;
    }
  }

  data.textoCompleto = getVisibleText();
  return data;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get visible text content, cleaned up and truncated. */
function getVisibleText() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG'].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const chunks = [];
  let totalLen = 0;
  const MAX_CHARS = 120_000; // ~30k tokens

  while (walker.nextNode()) {
    const text = walker.currentNode.textContent?.trim();
    if (text && text.length > 1) {
      chunks.push(text);
      totalLen += text.length;
      if (totalLen > MAX_CHARS) break;
    }
  }

  return chunks.join('\n');
}

/** Get selected text on the page. */
function getSelectedText() {
  return window.getSelection()?.toString()?.trim() || '';
}

// ---------------------------------------------------------------------------
// Extract process data based on detected system
// ---------------------------------------------------------------------------

function extractProcessData() {
  const { key, name } = detectCourtSystem();

  let data;
  switch (key) {
    case 'PJE':
      data = extractPJeData();
      break;
    case 'ESAJ':
      data = extractESAJData();
      break;
    case 'EPROC':
      data = extractEProcData();
      break;
    default:
      data = extractGenericData();
      break;
  }

  data.url = location.href;
  data.titulo = document.title;
  data.sistemaDetectado = name;
  data.dataExtracao = new Date().toISOString();

  return data;
}

// ---------------------------------------------------------------------------
// Message handlers (communication with background.js)
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'EXTRACT_PROCESS': {
      const data = extractProcessData();
      sendResponse({ success: true, data });
      break;
    }

    case 'GET_SELECTED_TEXT': {
      const text = getSelectedText();
      sendResponse({ success: true, text });
      break;
    }

    case 'GET_PAGE_INFO': {
      const { name } = detectCourtSystem();
      sendResponse({
        success: true,
        info: {
          url: location.href,
          title: document.title,
          system: name,
          hasProcess: !!document.querySelector(
            '.numProcesso, #numeroProcesso, .infraNomeProcesso, .nuProcesso'
          ),
        },
      });
      break;
    }

    case 'PING': {
      sendResponse({ success: true });
      break;
    }

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }

  return true; // Keep the message channel open for async responses
});

// ---------------------------------------------------------------------------
// Inject floating action button on court pages
// ---------------------------------------------------------------------------

function injectFAB() {
  if (document.getElementById('assistjur-fab')) return;

  const fab = document.createElement('div');
  fab.id = 'assistjur-fab';
  fab.title = 'AssistJur.IA — Analisar processo';
  fab.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  `;

  fab.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' });
  });

  document.body.appendChild(fab);
}

// Inject FAB after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectFAB);
} else {
  injectFAB();
}

// Notify background that content script is loaded
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', url: location.href });
