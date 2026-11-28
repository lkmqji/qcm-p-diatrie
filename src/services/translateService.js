// ============================================================================
// Service de Traduction Directe au Surlignage (Google Translate + Préférences)
// ============================================================================

export const TRANSLATE_ENABLED_KEY = 'pedia_translate_enabled';
export const TRANSLATE_LANG_KEY = 'pedia_translate_lang';

export const SUPPORTED_TRANSLATE_LANGUAGES = [
  { code: 'ar', label: 'Arabe', nativeLabel: 'العربية', flag: '🇩🇿', rtl: true },
  { code: 'en', label: 'Anglais', nativeLabel: 'English', flag: '🇬🇧', rtl: false },
  { code: 'fr', label: 'Français', nativeLabel: 'Français', flag: '🇫🇷', rtl: false },
  { code: 'de', label: 'Allemand', nativeLabel: 'Deutsch', flag: '🇩🇪', rtl: false }
];

const DEFAULT_TRANSLATE_LANG = 'ar';

/**
 * Resolve metadata for a supported target language code.
 */
export function getTranslateLanguageMeta(langCode) {
  const normalized = String(langCode || '').trim().toLowerCase();
  return (
    SUPPORTED_TRANSLATE_LANGUAGES.find(lang => lang.code === normalized) ||
    SUPPORTED_TRANSLATE_LANGUAGES[0]
  );
}

/**
 * Return whether highlight-to-translate is enabled (defaults to true).
 */
export function isHighlightTranslateEnabled() {
  try {
    const raw = localStorage.getItem(TRANSLATE_ENABLED_KEY);
    if (raw === null || raw === undefined || raw === '') return true;
    return raw !== 'false' && raw !== '0';
  } catch {
    return true;
  }
}

/**
 * Persist highlight-to-translate enabled preference and synchronize settings UI if present.
 */
export function setHighlightTranslateEnabled(enabled) {
  const isEnabled = Boolean(enabled);
  try {
    localStorage.setItem(TRANSLATE_ENABLED_KEY, isEnabled ? 'true' : 'false');
  } catch {}
  if (typeof document !== 'undefined') {
    const toggleBtn = document.getElementById('btn-toggle-translate-enabled');
    const toggleBadge = document.getElementById('settings-translate-status-badge');
    const toggleInput = document.getElementById('settings-translate-enabled');
    if (toggleInput) {
      toggleInput.checked = isEnabled;
    }
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-pressed', isEnabled ? 'true' : 'false');
      toggleBtn.classList.toggle('is-active', isEnabled);
      toggleBtn.classList.toggle('is-disabled', !isEnabled);
      const labelEl = toggleBtn.querySelector('[data-translate-toggle-label]');
      if (labelEl) {
        labelEl.textContent = isEnabled
          ? 'Traduction activée (Cliquer pour désactiver)'
          : 'Traduction désactivée (Cliquer pour activer)';
      }
    }
    if (toggleBadge) {
      toggleBadge.textContent = isEnabled ? 'Activée' : 'Désactivée';
      toggleBadge.classList.toggle('is-off', !isEnabled);
    }
  }
  return isEnabled;
}

/**
 * Return configured target translation language code (defaults to 'ar').
 */
export function getHighlightTranslateLang() {
  try {
    const raw = String(localStorage.getItem(TRANSLATE_LANG_KEY) || '').trim().toLowerCase();
    const match = SUPPORTED_TRANSLATE_LANGUAGES.find(l => l.code === raw);
    return match ? match.code : DEFAULT_TRANSLATE_LANG;
  } catch {
    return DEFAULT_TRANSLATE_LANG;
  }
}

/**
 * Persist target translation language code (falls back to 'ar' if unsupported).
 */
export function setHighlightTranslateLang(langCode) {
  const normalized = String(langCode || '').trim().toLowerCase();
  const match = SUPPORTED_TRANSLATE_LANGUAGES.find(l => l.code === normalized);
  const cleanLang = match ? match.code : DEFAULT_TRANSLATE_LANG;
  try {
    localStorage.setItem(TRANSLATE_LANG_KEY, cleanLang);
  } catch {}
  if (typeof document !== 'undefined') {
    const selectEl = document.getElementById('settings-translate-lang');
    if (selectEl) selectEl.value = cleanLang;
  }
  return cleanLang;
}

/**
 * Split arbitrarily long text into chunks under maxChunkLen on sentence/word boundaries.
 */
export function splitTextIntoTranslateChunks(text, maxChunkLen = 900) {
  const normalized = String(text || '').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChunkLen) return [normalized];

  const chunks = [];
  let remaining = normalized;

  while (remaining.length > maxChunkLen) {
    const slice = remaining.slice(0, maxChunkLen);
    let splitIdx = -1;

    // Prefer splitting on newline or sentence boundary first, then whitespace
    const sentenceMatches = [...slice.matchAll(/[\n.!?؛؟]+(?=\s|$)/g)];
    if (sentenceMatches.length > 0) {
      const last = sentenceMatches[sentenceMatches.length - 1];
      if (last.index >= Math.floor(maxChunkLen * 0.35)) {
        splitIdx = last.index + last[0].length;
      }
    }

    if (splitIdx === -1) {
      const lastSpace = slice.lastIndexOf(' ');
      if (lastSpace >= Math.floor(maxChunkLen * 0.3)) {
        splitIdx = lastSpace;
      } else {
        splitIdx = maxChunkLen;
      }
    }

    const piece = remaining.slice(0, splitIdx).trim();
    if (piece) chunks.push(piece);
    remaining = remaining.slice(splitIdx).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function createTranslateError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function parseGoogleTranslateResponse(payload) {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    throw createTranslateError('INVALID_RESPONSE', 'Format de réponse Google Traduction invalide.');
  }

  const translatedText = payload[0]
    .map(segment => (Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : ''))
    .join('')
    .trim();

  if (!translatedText) {
    throw createTranslateError('EMPTY_TRANSLATION', 'Aucune traduction retournée.');
  }

  const detectedSourceLang = typeof payload[2] === 'string' ? payload[2].toLowerCase() : '';
  return { translatedText, detectedSourceLang };
}

/**
 * Translate arbitrary-length text directly via Google Translate without persistent local cache.
 */
export async function translateWithGoogle(text, targetLang = getHighlightTranslateLang(), options = {}) {
  const cleanText = String(text || '').trim();
  if (!cleanText) {
    throw createTranslateError('EMPTY_TEXT', 'Aucun texte sélectionné à traduire.');
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw createTranslateError(
      'OFFLINE_ERROR',
      'Traduction indisponible hors-ligne. Vérifiez votre connexion Internet.'
    );
  }

  if (typeof fetch !== 'function') {
    throw createTranslateError('NETWORK_UNAVAILABLE', 'API réseau fetch indisponible.');
  }

  const langMeta = getTranslateLanguageMeta(targetLang);
  const chunks = splitTextIntoTranslateChunks(cleanText, 900);
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 6500;
  const externalSignal = options.signal || null;

  const translatedParts = [];
  let detectedSourceLang = '';

  for (const chunk of chunks) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timeoutId = null;
    let abortListener = null;

    if (controller) {
      if (externalSignal) {
        if (externalSignal.aborted) {
          throw createTranslateError('ABORTED', 'Traduction annulée.');
        }
        abortListener = () => controller.abort();
        externalSignal.addEventListener('abort', abortListener, { once: true });
      }
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    const url =
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(langMeta.code)}&dt=t&q=${encodeURIComponent(chunk)}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller ? controller.signal : undefined
      });

      if (!response || !response.ok) {
        const status = response ? response.status : 0;
        throw createTranslateError(
          status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR',
          status === 429
            ? 'Limite temporaire Google Traduction atteinte.'
            : `Erreur Google Traduction (HTTP ${status || 'inconnu'}).`
        );
      }

      const data = await response.json();
      const parsed = parseGoogleTranslateResponse(data);
      translatedParts.push(parsed.translatedText);
      if (!detectedSourceLang && parsed.detectedSourceLang) {
        detectedSourceLang = parsed.detectedSourceLang;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        if (externalSignal && externalSignal.aborted) {
          throw createTranslateError('ABORTED', 'Traduction annulée.');
        }
        throw createTranslateError('TIMEOUT_ERROR', 'Délai dépassé lors de la connexion à Google Traduction.');
      }
      if (err && err.code) {
        throw err;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw createTranslateError(
          'OFFLINE_ERROR',
          'Traduction indisponible hors-ligne. Vérifiez votre connexion Internet.'
        );
      }
      throw createTranslateError(
        'NETWORK_ERROR',
        'Impossible de joindre Google Traduction pour le moment.'
      );
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (externalSignal && abortListener) {
        externalSignal.removeEventListener('abort', abortListener);
      }
    }
  }

  return {
    translatedText: translatedParts.join(' ').trim(),
    detectedSourceLang,
    targetLang: langMeta.code,
    provider: 'google'
  };
}
