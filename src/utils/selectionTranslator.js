// ============================================================================
// Bulle Flottante de Traduction Instantanée au Surlignage (Desktop & Mobile)
// ============================================================================
import {
  SUPPORTED_TRANSLATE_LANGUAGES,
  getTranslateLanguageMeta,
  isHighlightTranslateEnabled,
  getHighlightTranslateLang,
  setHighlightTranslateLang,
  translateWithGoogle
} from '../services/translateService.js';
import { geminiService } from '../services/gemini.js';
import { getEffectiveArenaQuestion } from '../state/appState.js';
import { escapeHtml, parseMarkdownInline } from './formatters.js';
import { refreshLucide, showAppToast } from './uiDialogs.js';

const MEDICAL_CONTENT_SELECTORS = [
  '#view-arena',
  '#view-notebook',
  '#modal-error',
  '#modal-clinical-case-summary',
  '#arena-ai-chatbox'
];

const EXCLUDED_SELECTION_SELECTORS = [
  '.selection-translate-popover',
  'input',
  'textarea',
  'select',
  'button',
  '[contenteditable="true"]',
  '.chapter-title-badge.is-blurred',
  '.chatbox-chapter-blurred.is-blurred',
  '.arena-header',
  '.arena-footer-actions',
  '.arena-clinical-actions',
  '.notebook-toolbar',
  '.notebook-controls'
];

let isTranslatorInitialized = false;
let popoverEl = null;
let activeAbortController = null;
let selectionDebounceTimer = null;
let lastPointerUpAt = 0;

const translatorState = {
  isOpen: false,
  selectedText: '',
  targetLang: 'ar',
  detectedSourceLang: '',
  translatedText: '',
  provider: 'google',
  status: 'idle', // 'idle' | 'loading' | 'success' | 'error'
  errorMessage: '',
  aiStatus: 'idle', // 'idle' | 'loading' | 'success' | 'error'
  aiText: '',
  aiModelUsed: '',
  aiErrorMessage: '',
  anchorRect: null
};

/**
 * Return true if the user currently has a non-empty text selection inside the document.
 * Used as an accidental-click guard on interactive QCM option cards.
 */
export function hasActiveTextSelection() {
  if (typeof window === 'undefined' || typeof window.getSelection !== 'function') return false;
  const sel = window.getSelection();
  return Boolean(sel && !sel.isCollapsed && String(sel.toString() || '').trim().length > 0);
}

export function isSelectionTranslatePopoverOpen() {
  return Boolean(translatorState.isOpen && popoverEl && popoverEl.style.display !== 'none');
}

export function closeSelectionTranslatePopover() {
  if (activeAbortController) {
    try { activeAbortController.abort(); } catch {}
    activeAbortController = null;
  }
  translatorState.isOpen = false;
  translatorState.selectedText = '';
  translatorState.translatedText = '';
  translatorState.status = 'idle';
  translatorState.errorMessage = '';
  translatorState.aiStatus = 'idle';
  translatorState.aiText = '';
  translatorState.aiErrorMessage = '';
  translatorState.anchorRect = null;

  if (popoverEl) {
    popoverEl.style.display = 'none';
  }
}

function getElementFromNode(node) {
  if (!node) return null;
  if (node.nodeType === 1) return node;
  return node.parentElement || null;
}

function isSelectionInsideMedicalZone(selection) {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  const startEl = getElementFromNode(range.startContainer);
  const endEl = getElementFromNode(range.endContainer);
  const commonEl = getElementFromNode(range.commonAncestorContainer);

  const candidates = [startEl, endEl, commonEl].filter(Boolean);
  if (candidates.length === 0) return false;

  const isInMedicalContainer = candidates.some(el =>
    MEDICAL_CONTENT_SELECTORS.some(sel => Boolean(el.closest && el.closest(sel)))
  );
  if (!isInMedicalContainer) return false;

  const isExcluded = candidates.some(el =>
    EXCLUDED_SELECTION_SELECTORS.some(sel => Boolean(el.closest && el.closest(sel)))
  );
  if (isExcluded) return false;

  return true;
}

function getSelectionBoundingRect(selection) {
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect && (rect.width > 0 || rect.height > 0)) {
    return rect;
  }
  const clientRects = range.getClientRects ? range.getClientRects() : null;
  if (clientRects && clientRects.length > 0) {
    return clientRects[0];
  }
  return null;
}

function ensurePopoverElement() {
  if (typeof document === 'undefined' || !document.body) return null;
  if (popoverEl && document.body.contains(popoverEl)) return popoverEl;

  const el = document.createElement('div');
  el.id = 'selection-translate-popover';
  el.className = 'selection-translate-popover';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Traduction instantanée');
  el.style.display = 'none';

  el.addEventListener('mousedown', (e) => e.stopPropagation());
  el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    handlePopoverClick(e);
  });

  document.body.appendChild(el);
  popoverEl = el;
  return popoverEl;
}

function positionPopoverNearRect(rect) {
  if (!popoverEl || !rect || typeof window === 'undefined') return;

  const margin = 10;
  const vw = window.innerWidth || 360;
  const vh = window.innerHeight || 640;

  popoverEl.style.display = 'flex';
  popoverEl.style.visibility = 'hidden';
  popoverEl.style.left = '0px';
  popoverEl.style.top = '0px';

  const popRect = popoverEl.getBoundingClientRect();
  const popWidth = popRect.width || Math.min(360, vw - margin * 2);
  const popHeight = popRect.height || 180;

  const centerX = rect.left + rect.width / 2;
  let left = Math.round(centerX - popWidth / 2);
  left = Math.max(margin, Math.min(left, vw - popWidth - margin));

  const spaceAbove = rect.top - margin;
  const spaceBelow = vh - rect.bottom - margin;

  let top;
  if (spaceAbove >= popHeight + 8 || spaceAbove >= spaceBelow) {
    top = Math.round(rect.top - popHeight - 10);
    if (top < margin) top = Math.round(rect.bottom + 10);
  } else {
    top = Math.round(rect.bottom + 10);
  }
  top = Math.max(margin, Math.min(top, vh - popHeight - margin));

  popoverEl.style.left = `${left}px`;
  popoverEl.style.top = `${top}px`;
  popoverEl.style.visibility = 'visible';
}

function renderPopover() {
  const el = ensurePopoverElement();
  if (!el || !translatorState.isOpen) return;

  const langMeta = getTranslateLanguageMeta(translatorState.targetLang);
  const dirAttr = langMeta.rtl ? 'rtl' : 'ltr';
  const sourceBadge = translatorState.detectedSourceLang
    ? `${escapeHtml(translatorState.detectedSourceLang.toUpperCase())} → ${escapeHtml(langMeta.code.toUpperCase())}`
    : `AUTO → ${escapeHtml(langMeta.code.toUpperCase())}`;

  const langButtonsHtml = SUPPORTED_TRANSLATE_LANGUAGES.map(lang => {
    const activeClass = lang.code === langMeta.code ? 'is-active' : '';
    return `<button type="button" class="translate-lang-chip ${activeClass}" data-translate-lang="${escapeHtml(lang.code)}" title="${escapeHtml(lang.label)}">${lang.flag} ${escapeHtml(lang.code.toUpperCase())}</button>`;
  }).join('');

  let bodyHtml = '';
  if (translatorState.status === 'loading') {
    bodyHtml = `
      <div class="translate-popover-loading">
        <span class="translate-spinner"></span>
        <span>Traduction vers ${escapeHtml(langMeta.label)}...</span>
      </div>
    `;
  } else if (translatorState.status === 'error') {
    bodyHtml = `
      <div class="translate-popover-error">
        <div class="translate-error-msg">⚠️ ${escapeHtml(translatorState.errorMessage || 'Impossible de traduire pour le moment.')}</div>
        <div class="translate-error-actions">
          <button type="button" class="btn-translate-gemini-fallback" data-translate-action="fallback-gemini">
            <i data-lucide="sparkles" style="width:13px;height:13px;"></i>
            <span>Traduire avec Gemini IA</span>
          </button>
          <button type="button" class="btn-translate-retry" data-translate-action="retry-google">
            <i data-lucide="refresh-cw" style="width:13px;height:13px;"></i>
            <span>Réessayer</span>
          </button>
        </div>
      </div>
    `;
  } else if (translatorState.status === 'success') {
    const providerBadge = translatorState.provider === 'gemini'
      ? `<span class="translate-provider-tag is-gemini">✨ Gemini Flash</span>`
      : `<span class="translate-provider-tag">Google Traduction</span>`;
    bodyHtml = `
      <div class="translate-result-box" dir="${dirAttr}">
        <div class="translate-result-text">${escapeHtml(translatorState.translatedText)}</div>
      </div>
      <div class="translate-result-meta">
        ${providerBadge}
      </div>
    `;
  }

  let aiBoxHtml = '';
  if (translatorState.aiStatus === 'loading') {
    aiBoxHtml = `
      <div class="translate-ai-explain-box">
        <div class="translate-popover-loading" style="padding:6px 0;">
          <span class="translate-spinner"></span>
          <span>Analyse médicale Gemini en cours...</span>
        </div>
      </div>
    `;
  } else if (translatorState.aiStatus === 'success') {
    aiBoxHtml = `
      <div class="translate-ai-explain-box" dir="${dirAttr}">
        <div class="translate-ai-explain-header">
          <span>💡 Sens médical (${escapeHtml(translatorState.aiModelUsed || 'Gemini Flash')})</span>
        </div>
        <div class="translate-ai-explain-text">${parseMarkdownInline(translatorState.aiText)}</div>
      </div>
    `;
  } else if (translatorState.aiStatus === 'error') {
    const needsKey = translatorState.aiErrorMessage && translatorState.aiErrorMessage.includes('NO_API_KEY_CONFIGURED');
    aiBoxHtml = `
      <div class="translate-ai-explain-box is-error">
        <div class="translate-error-msg">
          ${needsKey
            ? '🔑 Configurez une clé API Gemini dans les Paramètres pour activer le sens médical IA.'
            : escapeHtml(translatorState.aiErrorMessage || 'Analyse médicale IA indisponible.')}
        </div>
        ${needsKey ? `<button type="button" class="btn-translate-open-settings" data-translate-action="open-settings">Ouvrir Paramètres</button>` : ''}
      </div>
    `;
  }

  const copyDisabled = translatorState.status !== 'success' || !translatorState.translatedText ? 'disabled' : '';

  el.innerHTML = `
    <div class="translate-popover-header">
      <div class="translate-popover-title">
        <span>🌐</span>
        <span class="translate-direction-badge">${sourceBadge}</span>
      </div>
      <div class="translate-lang-switcher">${langButtonsHtml}</div>
    </div>
    <div class="translate-source-preview" title="${escapeHtml(translatorState.selectedText)}">
      « ${escapeHtml(translatorState.selectedText)} »
    </div>
    <div class="translate-popover-body">
      ${bodyHtml}
      ${aiBoxHtml}
    </div>
    <div class="translate-popover-footer">
      <button type="button" class="btn-translate-footer is-ai" data-translate-action="explain-ai">
        <i data-lucide="sparkles" style="width:13px;height:13px;"></i>
        <span>Sens médical (IA)</span>
      </button>
      <button type="button" class="btn-translate-footer" data-translate-action="copy" ${copyDisabled}>
        <i data-lucide="copy" style="width:13px;height:13px;"></i>
        <span>Copier</span>
      </button>
    </div>
  `;

  refreshLucide(el);
  if (translatorState.anchorRect) {
    positionPopoverNearRect(translatorState.anchorRect);
  }
}

async function runGoogleTranslationForCurrentSelection() {
  const text = translatorState.selectedText;
  const targetLang = translatorState.targetLang;
  if (!text) return;

  if (activeAbortController) {
    try { activeAbortController.abort(); } catch {}
  }
  activeAbortController = typeof AbortController === 'function' ? new AbortController() : null;

  translatorState.status = 'loading';
  translatorState.translatedText = '';
  translatorState.detectedSourceLang = '';
  translatorState.errorMessage = '';
  translatorState.provider = 'google';
  renderPopover();

  try {
    const res = await translateWithGoogle(text, targetLang, {
      signal: activeAbortController ? activeAbortController.signal : undefined
    });
    if (!translatorState.isOpen || translatorState.selectedText !== text || translatorState.targetLang !== targetLang) {
      return;
    }
    translatorState.status = 'success';
    translatorState.translatedText = res.translatedText;
    translatorState.detectedSourceLang = res.detectedSourceLang || '';
    translatorState.provider = 'google';
    renderPopover();
  } catch (err) {
    if (err && err.code === 'ABORTED') return;
    if (!translatorState.isOpen || translatorState.selectedText !== text) return;
    translatorState.status = 'error';
    translatorState.errorMessage = (err && err.message) ? err.message : 'Traduction Google indisponible.';
    renderPopover();
  }
}

async function runGeminiTranslationFallback() {
  const text = translatorState.selectedText;
  const targetLang = translatorState.targetLang;
  if (!text) return;

  translatorState.status = 'loading';
  translatorState.errorMessage = '';
  renderPopover();

  try {
    const question = typeof getEffectiveArenaQuestion === 'function' ? getEffectiveArenaQuestion() : null;
    const res = await geminiService.translateWithGemini(text, targetLang, question);
    if (!translatorState.isOpen || translatorState.selectedText !== text) return;
    translatorState.status = 'success';
    translatorState.translatedText = res.translatedText;
    translatorState.provider = 'gemini';
    renderPopover();
  } catch (err) {
    if (!translatorState.isOpen) return;
    translatorState.status = 'error';
    const msg = String(err && err.message || '');
    translatorState.errorMessage = msg.includes('NO_API_KEY_CONFIGURED')
      ? 'Aucune clé API Gemini configurée (ajoutez-en une dans Paramètres).'
      : (msg || 'Échec de la traduction Gemini.');
    renderPopover();
  }
}

async function runGeminiMedicalExplanation() {
  const text = translatorState.selectedText;
  const targetLang = translatorState.targetLang;
  if (!text || translatorState.aiStatus === 'loading') return;

  translatorState.aiStatus = 'loading';
  translatorState.aiText = '';
  translatorState.aiErrorMessage = '';
  renderPopover();

  try {
    const question = typeof getEffectiveArenaQuestion === 'function' ? getEffectiveArenaQuestion() : null;
    const res = await geminiService.explainMedicalTerm(text, targetLang, question);
    if (!translatorState.isOpen || translatorState.selectedText !== text) return;
    translatorState.aiStatus = 'success';
    translatorState.aiText = res.explanation;
    translatorState.aiModelUsed = res.modelUsed || 'Gemini Flash';
    renderPopover();
  } catch (err) {
    if (!translatorState.isOpen) return;
    translatorState.aiStatus = 'error';
    translatorState.aiErrorMessage = String(err && err.message || 'Erreur lors de l’explication IA.');
    renderPopover();
  }
}

async function copyTranslatedText() {
  const textToCopy = translatorState.translatedText;
  if (!textToCopy) return;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(textToCopy);
    } else if (typeof document !== 'undefined') {
      const ta = document.createElement('textarea');
      ta.value = textToCopy;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showAppToast('📋 Traduction copiée !', { type: 'success', durationMs: 2000 });
  } catch {
    showAppToast('Impossible de copier dans le presse-papiers.', { type: 'warning', durationMs: 2500 });
  }
}

function handlePopoverClick(e) {
  const langBtn = e.target.closest('[data-translate-lang]');
  if (langBtn) {
    const newLang = langBtn.getAttribute('data-translate-lang');
    const cleanLang = setHighlightTranslateLang(newLang);
    if (translatorState.targetLang !== cleanLang || translatorState.status === 'error') {
      translatorState.targetLang = cleanLang;
      translatorState.aiStatus = 'idle';
      translatorState.aiText = '';
      runGoogleTranslationForCurrentSelection();
    }
    return;
  }

  const actionBtn = e.target.closest('[data-translate-action]');
  if (!actionBtn) return;

  const action = actionBtn.getAttribute('data-translate-action');
  if (action === 'retry-google') {
    runGoogleTranslationForCurrentSelection();
  } else if (action === 'fallback-gemini') {
    runGeminiTranslationFallback();
  } else if (action === 'explain-ai') {
    runGeminiMedicalExplanation();
  } else if (action === 'copy') {
    copyTranslatedText();
  } else if (action === 'open-settings') {
    closeSelectionTranslatePopover();
    if (typeof window !== 'undefined' && typeof window.openSettingsFromAi === 'function') {
      window.openSettingsFromAi();
    }
  }
}

function processCurrentSelection() {
  if (!isHighlightTranslateEnabled()) {
    closeSelectionTranslatePopover();
    return;
  }

  if (typeof window === 'undefined' || typeof window.getSelection !== 'function') return;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;

  const selectedText = String(selection.toString() || '').replace(/\s+/g, ' ').trim();
  if (!selectedText) return;

  if (!isSelectionInsideMedicalZone(selection)) {
    return;
  }

  const rect = getSelectionBoundingRect(selection);
  if (!rect) return;

  if (translatorState.isOpen && translatorState.selectedText === selectedText) {
    translatorState.anchorRect = rect;
    positionPopoverNearRect(rect);
    return;
  }

  translatorState.isOpen = true;
  translatorState.selectedText = selectedText;
  translatorState.targetLang = getHighlightTranslateLang();
  translatorState.aiStatus = 'idle';
  translatorState.aiText = '';
  translatorState.aiErrorMessage = '';
  translatorState.anchorRect = rect;

  runGoogleTranslationForCurrentSelection();
}

export function initSelectionTranslator() {
  if (isTranslatorInitialized || typeof document === 'undefined') return;
  isTranslatorInitialized = true;

  const onPointerRelease = () => {
    lastPointerUpAt = Date.now();
    setTimeout(processCurrentSelection, 20);
  };

  document.addEventListener('mouseup', onPointerRelease);
  document.addEventListener('touchend', onPointerRelease, { passive: true });

  document.addEventListener('selectionchange', () => {
    if (!isHighlightTranslateEnabled()) return;
    if (selectionDebounceTimer) clearTimeout(selectionDebounceTimer);
    selectionDebounceTimer = setTimeout(() => {
      selectionDebounceTimer = null;
      // Avoid duplicate rapid trigger right after mouseup/touchend
      if (Date.now() - lastPointerUpAt < 180) return;
      const sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
      if (!sel || sel.isCollapsed || !String(sel.toString() || '').trim()) {
        return;
      }
      processCurrentSelection();
    }, 340);
  });

  const handleOutsideInteraction = (e) => {
    if (!isSelectionTranslatePopoverOpen()) return;
    if (popoverEl && popoverEl.contains(e.target)) return;
    // Allow new selection gestures to finish cleanly before deciding to close
    setTimeout(() => {
      if (!isSelectionTranslatePopoverOpen()) return;
      const sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
      const hasSel = sel && !sel.isCollapsed && String(sel.toString() || '').trim().length > 0;
      if (!hasSel || !isSelectionInsideMedicalZone(sel)) {
        closeSelectionTranslatePopover();
      }
    }, 10);
  };

  document.addEventListener('mousedown', handleOutsideInteraction);
  document.addEventListener('touchstart', handleOutsideInteraction, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isSelectionTranslatePopoverOpen()) {
      closeSelectionTranslatePopover();
    }
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
      if (isSelectionTranslatePopoverOpen() && translatorState.anchorRect) {
        positionPopoverNearRect(translatorState.anchorRect);
      }
    });
  }
}
