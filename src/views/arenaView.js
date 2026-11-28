// ============================================================================
// Quiz Arena : Affichage QCM/CROQ, Médias, Historique, Snooze & Tuteur IA
// ============================================================================
import {
  appState,
  queueEngine,
  isArenaChapterRevealed,
  getEffectiveArenaQuestion,
  navigateToView,
  getDomViews,
  getDomModals
} from '../state/appState.js';
import { hydrateNote } from '../services/queueEngine.js';
import { geminiService, resolveAiModuleContext } from '../services/gemini.js';
import { studyTracker } from '../services/studyTracker.js';
import { resolveStorageKey } from '../services/storageScope.js';
import {
  escapeHtml,
  parseMarkdownInline,
  formatMedicalContent,
  formatReasoningNote,
  formatCroqAnswer,
  extractQuestionDateOrSession
} from '../utils/formatters.js';
import {
  refreshLucide,
  triggerMasteryConfetti,
  showAppToast,
  showConfirmModal
} from '../utils/uiDialogs.js';
import {
  hasActiveTextSelection,
  closeSelectionTranslatePopover
} from '../utils/selectionTranslator.js';
import { updateDashboardUI, updateArenaDailyBadge } from './dashboardView.js';
import { renderStatsUI } from './statsView.js';
import {
  buildClinicalCaseContext,
  updateClinicalCaseUI,
  updateClinicalUncleanedBadge,
  updateClinicalRunBarUI,
  verifySequentialSubQuestion,
  verifySequentialCroqSubQuestion,
  renderClinicalSequentialView
} from './clinicalCaseView.js';

export function findQuestionAcrossDatasets(uid) {
  if (!uid) return null;
  let q = appState.questionsMap.get(uid) || null;
  if (!q && typeof window !== 'undefined') {
    if (uid.startsWith('psy_') && Array.isArray(window.PSY_QUESTIONS)) {
      q = window.PSY_QUESTIONS.find(x => x.uid === uid) || null;
    } else if (Array.isArray(window.PEDIA_QUESTIONS)) {
      q = window.PEDIA_QUESTIONS.find(x => x.uid === uid) || null;
    }
  }
  return q;
}

// ============================================================================
// MEDICAL MEDIA (PHOTOS) - SPOILER / RETRACTED & BLURRED BY DEFAULT
// ============================================================================
export function renderQuestionMedia(mediaUrls) {
  if (!mediaUrls || !Array.isArray(mediaUrls) || mediaUrls.length === 0) {
    return '';
  }

  const count = mediaUrls.length;
  const cardsHtml = mediaUrls.map((url, idx) => {
    const escapedUrl = escapeHtml(url);
    const numLabel = count > 1 ? ` #${idx + 1}` : '';
    return `
      <div class="medical-media-card is-collapsed" data-media-url="${escapedUrl}">
        <div class="medical-media-inner" onclick="window.toggleMedicalMedia(this.parentElement, event)" title="Toucher pour afficher clairement">
          <button type="button" class="btn-media-card-close" onclick="window.toggleMedicalMedia(this.closest('.medical-media-card'), event)" title="Fermer / Masquer la photo">
            <i data-lucide="x" style="width:13px;height:13px;"></i>
          </button>
          <img src="${escapedUrl}" class="medical-media-img" alt="Iconographie médicale${numLabel}" loading="lazy">
          <div class="medical-media-spoiler-overlay">
            <span class="medical-media-badge">
              <i data-lucide="eye" style="width:11px;height:11px;"></i>
              <span>Toucher pour afficher</span>
            </span>
            <span class="medical-media-subtext">Photo floutée</span>
          </div>
        </div>
        <div class="medical-media-actions">
          <button type="button" class="btn-media-zoom" onclick="window.openMediaLightbox('${escapedUrl}', event)">
            <i data-lucide="maximize-2" style="width:12px;height:12px;"></i>
            <span>Plein écran HD</span>
          </button>
          <button type="button" class="btn-media-close" onclick="window.toggleMedicalMedia(this.closest('.medical-media-card'), event)" title="Masquer et reflouter la photo">
            <i data-lucide="x" style="width:12px;height:12px;"></i>
            <span>Fermer la photo</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="medical-media-section">
      <div class="medical-media-header">
        <div class="medical-media-title">
          <i data-lucide="image" style="width:14px;height:14px;color:var(--cyan);"></i>
          <span>Iconographie médicale (${count} photo${count > 1 ? 's' : ''})</span>
        </div>
        <div class="medical-media-header-actions">
          <button type="button" class="btn-media-bulk btn-media-expand-all" onclick="window.toggleAllMedicalMedia(true, event)" title="Afficher toutes les photos de la question">
            <i data-lucide="eye" style="width:12px;height:12px;"></i>
            <span>Tout afficher</span>
          </button>
          <button type="button" class="btn-media-bulk btn-media-collapse-all" onclick="window.toggleAllMedicalMedia(false, event)" title="Fermer et reflouter toutes les photos">
            <i data-lucide="eye-off" style="width:12px;height:12px;"></i>
            <span>Tout fermer</span>
          </button>
        </div>
      </div>
      <div class="medical-media-grid">
        ${cardsHtml}
      </div>
    </div>
  `;
}

window.toggleMedicalMedia = function(cardEl, event) {
  if (event) event.stopPropagation();
  if (!cardEl) return;
  const isCollapsed = cardEl.classList.contains('is-collapsed');
  if (isCollapsed) {
    cardEl.classList.remove('is-collapsed');
    cardEl.classList.add('is-expanded');
  } else {
    cardEl.classList.remove('is-expanded');
    cardEl.classList.add('is-collapsed');
  }
  refreshLucide(cardEl);
};

window.toggleAllMedicalMedia = function(forceExpand = null, event = null) {
  if (event) event.stopPropagation();
  const wrap = document.getElementById('arena-media-wrap');
  if (!wrap) return;
  const cards = wrap.querySelectorAll('.medical-media-card');
  if (!cards || cards.length === 0) return;

  const expand = typeof forceExpand === 'boolean'
    ? forceExpand
    : Array.from(cards).some(c => c.classList.contains('is-collapsed'));

  cards.forEach(card => {
    card.classList.toggle('is-expanded', expand);
    card.classList.toggle('is-collapsed', !expand);
  });

  refreshLucide(wrap);
};

window.toggleArenaChapterTitle = function(forceRevealed = null) {
  const badge = document.getElementById('arena-chapter-title');
  const chatBlurredEls = document.querySelectorAll('.chatbox-chapter-blurred');

  let willReveal;
  if (forceRevealed !== null) {
    willReveal = forceRevealed;
  } else if (badge) {
    willReveal = badge.classList.contains('is-blurred');
  } else {
    const firstChatEl = document.querySelector('.chatbox-chapter-blurred');
    willReveal = firstChatEl ? firstChatEl.classList.contains('is-blurred') : true;
  }

  if (badge) {
    if (willReveal) {
      badge.classList.remove('is-blurred');
      badge.classList.add('is-revealed');
      badge.title = 'Cliquer pour masquer le chapitre';
      const hint = badge.querySelector('.chapter-title-hint');
      if (hint && !hint.textContent.includes('QCM Répondu')) {
        hint.innerHTML = `<i data-lucide="eye-off" style="width:11px;height:11px;"></i> Cours visible`;
      }
    } else {
      badge.classList.add('is-blurred');
      badge.classList.remove('is-revealed');
      badge.title = 'Chapitre masqué (Cliquer pour afficher)';
      const hint = badge.querySelector('.chapter-title-hint');
      if (hint && !hint.textContent.includes('QCM Répondu')) {
        hint.innerHTML = `<i data-lucide="eye" style="width:11px;height:11px;"></i> Cours masqué`;
      }
    }
  }

  chatBlurredEls.forEach(el => {
    if (willReveal) {
      el.classList.remove('is-blurred');
      el.classList.add('is-revealed');
      el.title = 'Cours visible (Cliquer pour masquer)';
    } else {
      el.classList.add('is-blurred');
      el.classList.remove('is-revealed');
      el.title = "Cours masqué jusqu'à ce que vous répondiez (Cliquer pour afficher)";
    }
  });

  refreshLucide();
};

window.openMediaLightbox = function(url, event) {
  if (event) event.stopPropagation();
  let modal = document.getElementById('media-lightbox-modal');
  let img = document.getElementById('media-lightbox-img');
  const modCtx = resolveAiModuleContext(getEffectiveArenaQuestion());

  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'media-lightbox-overlay';
    modal.id = 'media-lightbox-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="media-lightbox-backdrop" onclick="window.closeMediaLightbox()"></div>
      <div class="media-lightbox-content">
        <button class="media-lightbox-close" onclick="window.closeMediaLightbox()" title="Fermer (Échap)">
          <i data-lucide="x"></i>
        </button>
        <img id="media-lightbox-img" src="" alt="Iconographie ${escapeHtml(modCtx.moduleName)} HD">
      </div>
    `;
    document.body.appendChild(modal);
    img = document.getElementById('media-lightbox-img');
  }

  if (img) {
    img.src = url;
    img.alt = `Iconographie ${modCtx.moduleName} HD`;
  }
  modal.style.display = 'flex';
  refreshLucide(modal);
};

window.closeMediaLightbox = function() {
  const modal = document.getElementById('media-lightbox-modal');
  if (modal) {
    modal.style.display = 'none';
  }
};

export function formatQuestionMistakeRecap(question, userSelectedLetters, isCroq = false, userCroqText = '', score = null) {
  if (!question) return '';

  const effectiveIsCroq = isCroq || (question && question.type === 'CROQ');
  const modCtx = resolveAiModuleContext(question);

  const lettersArr = Array.isArray(userSelectedLetters)
    ? userSelectedLetters
    : (userSelectedLetters ? String(userSelectedLetters).split(',').map(s => s.trim().toUpperCase()) : []);

  let clinicalHtml = '';
  if (question.clinical_case && question.clinical_case.trim()) {
    clinicalHtml = `
      <div class="mistake-clinical-box">
        <div class="mistake-clinical-header">
          <i data-lucide="stethoscope"></i>
          <span>Cas Clinique</span>
        </div>
        <div class="mistake-clinical-text">${formatMedicalContent(question.clinical_case.trim())}</div>
      </div>
    `;
  }

  let optionsOrCroqHtml = '';

  if (effectiveIsCroq) {
    const scoreBadge = (score !== null && score !== undefined)
      ? `<span class="answer-badge ${score >= 75 ? 'badge-success' : 'badge-failure'}">Score : ${score}%</span>`
      : '';
    optionsOrCroqHtml = `
      <div class="answer-comparison-grid">
        <div class="answer-box box-user">
          <div class="answer-box-header">
            <span class="answer-box-title text-rose">
              <span class="box-icon">✕</span> Votre proposition :
            </span>
            ${scoreBadge}
          </div>
          <div class="answer-box-content croq-user-text">
            ${userCroqText ? parseMarkdownInline(userCroqText) : '<em>Aucune réponse saisie</em>'}
          </div>
        </div>
        <div class="answer-box box-correct">
          <div class="answer-box-header">
            <span class="answer-box-title text-emerald">
              <span class="box-icon">✓</span> Réponse type officielle :
            </span>
            <span class="answer-badge badge-official">Référence concours</span>
          </div>
          <div class="answer-box-content">
            ${formatCroqAnswer(question.croq_answer || '')}
          </div>
        </div>
      </div>
    `;
  } else {
    const options = question.options || [];
    const correctOptions = options.filter(o => o.is_correct);
    const correctLetters = correctOptions.map(o => o.letter).sort();

    optionsOrCroqHtml = `
      <div class="mistake-options-container">
        <div class="mistake-options-header">
          <div style="display:flex;align-items:center;gap:6px;">
            <i data-lucide="list-checks" style="width:16px;height:16px;color:var(--cyan);"></i>
            <span style="font-weight:700;font-size:0.88rem;color:var(--text-main);">Toutes les propositions (A à E) &amp; Statut détaillé :</span>
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);">
            Bonne(s) réponse(s) : <strong class="text-emerald">${escapeHtml(correctLetters.join(', '))}</strong>
          </div>
        </div>
        <div class="mistake-options-list">
          ${options.map(opt => {
            const isCorrect = !!opt.is_correct;
            const isUserSelected = lettersArr.includes(opt.letter);

            let rowClass = 'opt-row-neutral';
            let badgeHtml = '';

            if (isUserSelected && !isCorrect) {
              rowClass = 'opt-row-wrong';
              badgeHtml = `<span class="opt-status-badge badge-wrong"><i data-lucide="x"></i> Mon choix (Faux)</span>`;
            } else if (isUserSelected && isCorrect) {
              rowClass = 'opt-row-correct-chosen';
              badgeHtml = `<span class="opt-status-badge badge-correct"><i data-lucide="check"></i> Mon choix (Juste)</span>`;
            } else if (!isUserSelected && isCorrect) {
              rowClass = 'opt-row-correct-missed';
              badgeHtml = `<span class="opt-status-badge badge-correct"><i data-lucide="check"></i> Réponse juste attendue</span>`;
            } else {
              badgeHtml = `<span class="opt-status-badge badge-neutral">Distracteur faux</span>`;
            }

            return `
              <div class="mistake-option-row ${rowClass}">
                <div class="mistake-option-letter">${escapeHtml(opt.letter)}</div>
                <div class="mistake-option-text">${parseMarkdownInline(opt.text)}</div>
                <div class="mistake-option-badge-wrap">${badgeHtml}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  let explanationHtml = '';
  if (question.explanation && question.explanation.trim()) {
    explanationHtml = `
      <div class="mistake-official-explanation-box">
        <div class="mistake-explanation-title">
          <i data-lucide="book-open" style="width:15px;height:15px;color:var(--cyan);"></i>
          <span>Explication &amp; Source Officielle (Base de Données)</span>
        </div>
        <div class="mistake-explanation-body">
          ${formatMedicalContent(question.explanation.trim())}
        </div>
      </div>
    `;
  }

  return `
    <div class="mistake-recap-wrapper">
      <div class="mistake-question-card">
        <div class="mistake-question-header">
          <span class="tag-pill tag-qcu" style="font-size:0.7rem;padding:2px 8px;">${escapeHtml(question.chapterTitle || modCtx.defaultChapter)}</span>
          <span class="tag-pill ${effectiveIsCroq ? 'tag-croq' : 'tag-qcu'}" style="font-size:0.7rem;padding:2px 8px;">${effectiveIsCroq ? 'CROQ' : 'QCM'}</span>
        </div>
        ${clinicalHtml}
        <div class="mistake-question-statement">
          ${formatMedicalContent(question.question || question.statement || '')}
        </div>
        ${renderQuestionMedia(question.media_urls || [])}
      </div>
      ${optionsOrCroqHtml}
      ${explanationHtml}
    </div>
  `;
}

// ============================================================================
// PERSISTENT AI EXPLANATIONS FOR ARENA QUESTIONS
// ============================================================================
export function getAiCacheKey() {
  return resolveStorageKey('ai_cache');
}

export function loadAiExplanationsCache() {
  try {
    const rawCache = localStorage.getItem(getAiCacheKey());
    if (rawCache) {
      const parsed = JSON.parse(rawCache);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {
    console.warn('Failed to load AI explanations cache:', e);
  }
  return {};
}

export function isExplanationMatchingQuestion(noteText, question) {
  if (!noteText || typeof noteText !== 'string' || !question) return false;

  const noteLower = noteText.toLowerCase();

  const themeMatch = noteText.match(/Thème clé\s*:\s*\*?([^\n\*\r\<\>]+)\*?/i);
  if (themeMatch && question.chapterTitle) {
    const noteTheme = themeMatch[1].trim().toLowerCase();
    const qChapter = question.chapterTitle.trim().toLowerCase();
    const cleanWords = (s) => (s || '').replace(/[^a-z0-9à-öø-ÿ]/gi, ' ').split(/\s+/).filter(w => w.length >= 4);
    const themeWords = cleanWords(noteTheme);
    const chapterWords = cleanWords(qChapter);
    const hasCommonWord = themeWords.some(tw => chapterWords.some(cw => tw.includes(cw) || cw.includes(tw)));
    if (!hasCommonWord && themeWords.length > 0 && chapterWords.length > 0) {
      return false;
    }
  }

  const stopWords = new Set(['dans', 'pour', 'avec', 'sans', 'chez', 'cette', 'sont', 'peut', 'tous', 'tout', 'faire', 'plus', 'leur', 'leurs', 'etre', 'avoir', 'donnez', 'quel', 'quelle', 'quelles', 'quels']);
  const getWords = (str) => (str || '').toLowerCase().replace(/[^a-z0-9à-öø-ÿ]/gi, ' ').split(/\s+/).filter(w => w.length >= 4 && !stopWords.has(w));

  if (Array.isArray(question.options) && question.options.length >= 2) {
    const optionKeywords = question.options.flatMap(o => getWords(o.text));
    const uniqueKeywords = Array.from(new Set(optionKeywords));
    const matchingKeywords = uniqueKeywords.filter(k => noteLower.includes(k));
    if (uniqueKeywords.length >= 3 && matchingKeywords.length < 2) {
      return false;
    }
  } else {
    const qKeywords = getWords(question.question || question.statement);
    const ansKeywords = getWords(question.croq_answer || '');
    const combined = Array.from(new Set([...qKeywords, ...ansKeywords]));
    const matching = combined.filter(k => noteLower.includes(k));
    if (combined.length >= 2 && matching.length === 0) {
      return false;
    }
  }

  return true;
}

export function scrubCorruptedAiExplanations() {
  try {
    let purgedCacheCount = 0;
    for (const [uid, item] of Object.entries(appState.aiExplanationsCache)) {
      if (!item || !item.note) continue;
      const q = findQuestionAcrossDatasets(uid);
      if (!q) continue;
      if (!isExplanationMatchingQuestion(item.note, q)) {
        delete appState.aiExplanationsCache[uid];
        purgedCacheCount++;
      }
    }
    if (purgedCacheCount > 0) {
      localStorage.setItem(getAiCacheKey(), JSON.stringify(appState.aiExplanationsCache));
      console.log(`[Diagnostic IA] Purged ${purgedCacheCount} mismatched AI explanation(s) from local cache.`);
    }

    const rawNotes = queueEngine.getRawReasoningNotes();
    let purgedNotesCount = 0;
    const cleanedNotes = rawNotes.filter(n => {
      if (!n || !n.questionUid || !n.reasoningNote) return true;
      const q = findQuestionAcrossDatasets(n.questionUid);
      if (!q) return true;
      if (!isExplanationMatchingQuestion(n.reasoningNote, q)) {
        purgedNotesCount++;
        return false;
      }
      return true;
    });

    if (purgedNotesCount > 0) {
      const reasoningKey = resolveStorageKey('reasoning_notes');
      localStorage.setItem(reasoningKey, JSON.stringify(cleanedNotes));
      console.log(`[Diagnostic IA] Purged ${purgedNotesCount} mismatched AI reasoning note(s) from Notebook.`);
      appState.firebaseSyncService?.triggerAutoPush();
    }
  } catch (err) {
    console.warn('[Diagnostic IA] Error while scrubbing explanations:', err);
  }
}

export function getSavedAiExplanation(questionUid, question = null) {
  if (!questionUid) return null;

  const targetQ = question || findQuestionAcrossDatasets(questionUid);

  const checkAndClean = (entry, source) => {
    if (!entry || !entry.note) return null;
    if (targetQ && !isExplanationMatchingQuestion(entry.note, targetQ)) {
      console.warn(`[AI Explanation] Mismatched note detected from ${source} for ${questionUid}. Purging corrupted entry.`);
      if (source === 'cache') {
        delete appState.aiExplanationsCache[questionUid];
        try {
          localStorage.setItem(getAiCacheKey(), JSON.stringify(appState.aiExplanationsCache));
        } catch {}
      }
      return null;
    }
    return entry;
  };

  if (appState.aiExplanationsCache[questionUid]) {
    const valid = checkAndClean(appState.aiExplanationsCache[questionUid], 'cache');
    if (valid) return valid;
  }

  const histItem = appState.answeredHistory.find(h => h.question && h.question.uid === questionUid && h.aiReasoning);
  if (histItem) {
    const entry = { note: histItem.aiReasoning, modelUsed: histItem.modelUsed || 'Gemini Flash' };
    const valid = checkAndClean(entry, 'history');
    if (valid) return valid;
    histItem.aiReasoning = null;
    histItem.modelUsed = null;
  }

  const rawNotes = queueEngine.getRawReasoningNotes();
  const rawNote = rawNotes.find(n => n.questionUid === questionUid && n.reasoningNote);
  if (rawNote) {
    const note = hydrateNote(rawNote, appState.questionsMap);
    const entry = { note: note.reasoningNote, modelUsed: note.modelUsed || 'Gemini Flash' };
    const valid = checkAndClean(entry, 'notebook');
    if (valid) return valid;
    if (note.id) {
      queueEngine.deleteReasoningNote(note.id);
    }
  }
  return null;
}

export function saveAiExplanationForQuestion(questionUid, noteText, modelUsed = 'Gemini Flash', question = null) {
  if (!questionUid || !noteText) return;

  const targetQ = question || findQuestionAcrossDatasets(questionUid);
  if (targetQ && !isExplanationMatchingQuestion(noteText, targetQ)) {
    console.warn(`[AI Explanation] Refusing to save mismatched note for ${questionUid}`);
    return;
  }

  appState.aiExplanationsCache[questionUid] = {
    note: noteText,
    modelUsed: modelUsed || 'Gemini Flash',
    questionText: targetQ ? (targetQ.question || targetQ.statement) : '',
    chapterTitle: targetQ ? targetQ.chapterTitle : '',
    timestamp: Date.now()
  };
  try {
    localStorage.setItem(getAiCacheKey(), JSON.stringify(appState.aiExplanationsCache));
  } catch (e) {
    console.warn('Failed to persist AI explanations cache:', e);
  }

  appState.answeredHistory.forEach(item => {
    if (item.question && item.question.uid === questionUid) {
      item.aiReasoning = noteText;
      item.modelUsed = modelUsed;
    }
  });

  const existingNotes = queueEngine.getRawReasoningNotes();
  const alreadySaved = existingNotes.some(n => n.questionUid === questionUid);
  if (!alreadySaved && targetQ) {
    const isCroq = !!targetQ.is_croq;
    const correctLetters = isCroq ? [] : (targetQ.options || []).filter(o => o.is_correct).map(o => o.letter);
    const correctText = isCroq ? (targetQ.croq_answer || '') : (targetQ.options || []).filter(o => o.is_correct).map(o => `${o.letter}. ${o.text}`).join(' | ');
    const noteRecord = {
      id: `note_${Date.now()}`,
      questionUid: targetQ.uid,
      questionText: targetQ.question,
      clinicalCase: targetQ.clinical_case || null,
      chapterTitle: targetQ.chapterTitle,
      options: targetQ.options ? JSON.parse(JSON.stringify(targetQ.options)) : [],
      media_urls: targetQ.media_urls || [],
      userAnswer: isCroq ? 'Consultation & Révision' : correctLetters.join(', '),
      userAnswerLetters: correctLetters,
      correctAnswer: correctText,
      officialExplanation: targetQ.explanation || '',
      isCroq,
      score: null,
      reasoningNote: noteText,
      modelUsed,
      timestamp: Date.now()
    };
    queueEngine.saveReasoningNote(noteRecord);
    appState.firebaseSyncService?.triggerAutoPush();
    const notesCount = queueEngine.getRawReasoningNotes().length;
    const badgeEl = document.getElementById('notebook-count-badge');
    if (badgeEl) badgeEl.textContent = notesCount;
  }
}

export function renderArenaAiExplanation(question) {
  const box = document.getElementById('arena-ai-explanation-box');
  const textEl = document.getElementById('arena-ai-explanation-text');
  const modelTag = document.getElementById('arena-ai-model-tag');
  const regenBtn = document.getElementById('btn-arena-ai-regenerate');
  if (!box || !textEl || !question) return;

  const saved = getSavedAiExplanation(question.uid, question);
  box.style.display = 'flex';

  if (saved && saved.note) {
    if (modelTag) modelTag.textContent = saved.modelUsed || 'Gemini Flash';
    if (regenBtn) regenBtn.style.display = 'inline-flex';
    textEl.innerHTML = formatReasoningNote(saved.note);
  } else {
    if (modelTag) modelTag.textContent = 'Gemini Flash';
    if (regenBtn) regenBtn.style.display = 'none';
    textEl.innerHTML = `
      <div class="arena-ai-prompt-box">
        <div class="arena-ai-prompt-info">
          <i data-lucide="sparkles" style="color:var(--cyan);width:16px;height:16px;flex-shrink:0;"></i>
          <span>Aucune explication IA générée pour ce QCM. Obtenez l'analyse clinique complète proposition par proposition.</span>
        </div>
        <button type="button" class="btn-ask-arena-ai" onclick="window.requestArenaAiExplanation()" id="btn-arena-ai-generate">
          <i data-lucide="sparkles" style="width:14px;height:14px;"></i>
          <span>Générer l'explication clinique IA (Gemini Flash)</span>
        </button>
      </div>
    `;
  }
  refreshLucide(box);
}

window.regenerateArenaAiExplanation = async function() {
  const effQ = getEffectiveArenaQuestion();
  if (!effQ) return;
  const targetUid = effQ.uid;

  delete appState.aiExplanationsCache[targetUid];
  try {
    localStorage.setItem(getAiCacheKey(), JSON.stringify(appState.aiExplanationsCache));
  } catch {}

  appState.answeredHistory.forEach(item => {
    if (item.question && item.question.uid === targetUid) {
      item.aiReasoning = null;
      item.modelUsed = null;
    }
  });

  queueEngine.deleteReasoningNotesByQuestionUid(targetUid);
  await window.requestArenaAiExplanation(true);
};

window.requestArenaAiExplanation = async function(_forceRegen = false) {
  const effQ = getEffectiveArenaQuestion();
  if (!effQ) return;
  const targetUid = effQ.uid;
  const box = document.getElementById('arena-ai-explanation-box');
  const textEl = document.getElementById('arena-ai-explanation-text');
  const modelTag = document.getElementById('arena-ai-model-tag');
  const regenBtn = document.getElementById('btn-arena-ai-regenerate');
  if (!box || !textEl) return;

  if (!geminiService.hasApiKeys()) {
    showAppToast('💡 Mode hors-ligne : ajoutez une clé API Google Gemini dans Paramètres pour générer via IA.', { type: 'warning' });
  }

  if (regenBtn) regenBtn.style.display = 'none';
  box.style.display = 'flex';
  textEl.innerHTML = `
    <div class="reasoning-loader-wrap" style="padding:16px;text-align:center;">
      <i data-lucide="sparkles" class="spin" style="width:20px;height:20px;color:var(--cyan);margin-bottom:8px;"></i>
      <div style="font-size:0.88rem;color:var(--cyan);font-weight:600;">Génération de l'explication clinique IA complète (Gemini Flash)...</div>
      <div style="font-size:0.75rem;color:var(--text-dim);margin-top:4px;">Justification détaillée proposition par proposition et mémo concours.</div>
    </div>
  `;
  refreshLucide(box);

  try {
    const isCroq = !!effQ.is_croq;
    const correctLetters = isCroq ? [] : (effQ.options || []).filter(o => o.is_correct).map(o => o.letter);
    const reasoningObj = await geminiService.generateReasoningNote(
      effQ,
      correctLetters,
      isCroq,
      ''
    );

    saveAiExplanationForQuestion(targetUid, reasoningObj.note, reasoningObj.modelUsed, effQ);

    const currentEffQ = getEffectiveArenaQuestion();
    if (currentEffQ && currentEffQ.uid === targetUid) {
      textEl.innerHTML = formatReasoningNote(reasoningObj.note);
      if (modelTag) modelTag.textContent = reasoningObj.modelUsed;
      if (regenBtn) regenBtn.style.display = 'inline-flex';
      refreshLucide(box);
    }
  } catch (err) {
    const currentEffQ = getEffectiveArenaQuestion();
    if (currentEffQ && currentEffQ.uid === targetUid) {
      textEl.innerHTML = `
        <div style="color:var(--rose);padding:12px;font-size:0.85rem;">
          ⚠️ Impossible de générer l'explication IA : ${escapeHtml(err.message || 'Erreur réseau')}
          <div style="margin-top:8px;">
            <button type="button" class="btn-ask-arena-ai" onclick="window.requestArenaAiExplanation(true)">Réessayer</button>
          </div>
        </div>
      `;
      refreshLucide(box);
    }
  }
};

// ============================================================================
// ARENA HISTORY NAVIGATION
// ============================================================================
export function pushToAnsweredHistory(question, userAnswerLetters, isCorrect, score = null) {
  if (!question) return;
  const savedAi = getSavedAiExplanation(question.uid, question);
  const snapshot = {
    question: { ...question },
    userAnswerLetters: Array.isArray(userAnswerLetters) ? [...userAnswerLetters] : (userAnswerLetters ? [userAnswerLetters] : []),
    isCorrect: !!isCorrect,
    score,
    explanation: question.explanation || '',
    aiReasoning: savedAi ? savedAi.note : null,
    modelUsed: savedAi ? savedAi.modelUsed : null,
    timestamp: Date.now()
  };

  if (appState.answeredHistory.length > 0 && appState.answeredHistory[0].question.uid === question.uid) {
    appState.answeredHistory[0] = snapshot;
  } else {
    appState.answeredHistory.unshift(snapshot);
    if (appState.answeredHistory.length > 5) {
      appState.answeredHistory = appState.answeredHistory.slice(0, 5);
    }
  }
  updateHistoryNavUI();
}

export function updateHistoryNavUI() {
  const prevBtn = document.getElementById('btn-history-prev');
  const nextBtn = document.getElementById('btn-history-next');
  const labelEl = document.getElementById('arena-history-label');
  const navBox = document.getElementById('arena-history-nav');
  const badgeEl = document.getElementById('arena-history-badge');
  const bannerEl = document.getElementById('arena-history-consult-banner');
  const resumeActionBtn = document.getElementById('btn-history-resume-action');
  const shortcutHint = document.getElementById('keyboard-shortcuts-hint');
  const btnSubmitAnswer = document.getElementById('btn-submit-answer');
  const btnSubmitCroq = document.getElementById('btn-submit-croq');

  if (!prevBtn || !nextBtn || !labelEl) return;

  if (appState.historyCursor === -1) {
    prevBtn.disabled = (appState.answeredHistory.length === 0);
    nextBtn.disabled = true;
    labelEl.textContent = appState.answeredHistory.length > 0 ? `Actuel (${appState.answeredHistory.length})` : 'Actuel';
    if (badgeEl) badgeEl.classList.remove('is-past');
    if (navBox) navBox.classList.remove('is-browsing');
    if (bannerEl) bannerEl.style.display = 'none';
    if (resumeActionBtn) resumeActionBtn.style.display = 'none';
    if (appState.currentQuestion) {
      if (appState.currentQuestion.is_croq) {
        if (btnSubmitCroq) btnSubmitCroq.style.display = 'flex';
      } else {
        if (btnSubmitAnswer) btnSubmitAnswer.style.display = 'flex';
      }
    }
  } else {
    prevBtn.disabled = (appState.historyCursor >= appState.answeredHistory.length - 1);
    nextBtn.disabled = false;
    labelEl.textContent = `Précédent ${appState.historyCursor + 1}/${appState.answeredHistory.length}`;
    if (badgeEl) badgeEl.classList.add('is-past');
    if (navBox) navBox.classList.add('is-browsing');
    if (bannerEl) bannerEl.style.display = 'flex';
    if (resumeActionBtn) resumeActionBtn.style.display = 'inline-flex';
    if (btnSubmitAnswer) btnSubmitAnswer.style.display = 'none';
    if (btnSubmitCroq) btnSubmitCroq.style.display = 'none';
    if (shortcutHint) shortcutHint.textContent = 'Mode Révision : QCM en lecture seule & Tuteur IA actif';
  }

  const btnSnooze = document.getElementById('btn-snooze-question');
  if (btnSnooze) {
    btnSnooze.style.display = (appState.historyCursor === -1 && !appState.isCurrentQuestionAnswered) ? 'inline-flex' : 'none';
  }
}

function renderHistoryQuestion(historyEntry) {
  if (!historyEntry || !historyEntry.question) return;
  const q = historyEntry.question;
  const modCtx = resolveAiModuleContext(q);

  appState.arenaChatHistory = [];
  updateArenaChatContext();
  const chatboxEl = document.getElementById('arena-ai-chatbox');
  if (chatboxEl && chatboxEl.style.display !== 'none') {
    renderChatWelcome();
  }

  const successBanner = document.getElementById('arena-success-banner');
  if (successBanner) successBanner.style.display = 'none';

  updateHistoryNavUI();

  const chapterBadge = document.getElementById('arena-chapter-title');
  if (chapterBadge) {
    chapterBadge.classList.remove('is-blurred');
    chapterBadge.classList.add('is-revealed');
    chapterBadge.title = 'Chapitre du QCM révisé';
    const dateStr = extractQuestionDateOrSession(q);
    const dateBadgeHtml = dateStr ? `<span class="question-date-pill" title="Date ou session du QCM : ${escapeHtml(dateStr)}"><i data-lucide="calendar" style="width:11px;height:11px;"></i> ${escapeHtml(dateStr)}</span>` : '';
    chapterBadge.innerHTML = `
      <span class="chapter-title-text">${escapeHtml(modCtx.moduleName)} — ${escapeHtml(q.chapterTitle || 'Général')}${dateBadgeHtml ? ' ' + dateBadgeHtml : ''}</span>
      <span class="chapter-title-hint" style="color:var(--amber);"><i data-lucide="history" style="width:11px;height:11px;"></i> QCM Répondu</span>
    `;
  }

  const typePill = document.getElementById('arena-type-pill');
  if (typePill) {
    typePill.textContent = q.type || 'QCM';
    typePill.className = `tag-pill tag-${(q.type || 'QCM').toLowerCase()}`;
  }

  const progressPill = document.getElementById('arena-progress-pill');
  if (progressPill) {
    const stats = queueEngine.getQuestionStats(q.uid);
    progressPill.textContent = historyEntry.isCorrect ? '✅ Répondu Juste' : `⚠️ Répondu Faux (${stats.mistakes} faute${stats.mistakes > 1 ? 's' : ''})`;
    progressPill.className = historyEntry.isCorrect ? 'tag-pill progress-pill' : 'tag-pill progress-penalized';
  }

  updateClinicalCaseUI(q);

  const qTextEl = document.getElementById('arena-question-text');
  if (qTextEl) qTextEl.innerHTML = formatMedicalContent(q.question || q.statement);

  const mediaWrap = document.getElementById('arena-media-wrap');
  if (mediaWrap) {
    if (q.media_urls && q.media_urls.length > 0) {
      mediaWrap.innerHTML = renderQuestionMedia(q.media_urls);
      mediaWrap.style.display = 'block';
    } else {
      mediaWrap.innerHTML = '';
      mediaWrap.style.display = 'none';
    }
  }

  const optionsContainer = document.getElementById('arena-options-container');
  const croqContainer = document.getElementById('arena-croq-container');
  const btnSubmitAnswer = document.getElementById('btn-submit-answer');
  const btnSubmitCroq = document.getElementById('btn-submit-croq');
  const resumeBtn = document.getElementById('btn-history-resume-action');

  if (btnSubmitAnswer) btnSubmitAnswer.style.display = 'none';
  if (btnSubmitCroq) btnSubmitCroq.style.display = 'none';
  if (resumeBtn) resumeBtn.style.display = 'inline-flex';

  if (q.is_croq) {
    if (optionsContainer) optionsContainer.style.display = 'none';
    if (croqContainer) croqContainer.style.display = 'flex';
    const croqInput = document.getElementById('arena-croq-input');
    if (croqInput) {
      croqInput.value = historyEntry.userAnswerLetters?.[0] || '';
      croqInput.disabled = true;
    }
  } else {
    if (croqContainer) croqContainer.style.display = 'none';
    if (optionsContainer) {
      optionsContainer.style.display = 'flex';
      optionsContainer.innerHTML = '';

      (q.options || []).forEach((opt, idx) => {
        const item = document.createElement('div');
        item.className = 'option-item read-only';
        item.dataset.optId = opt.id || idx;
        const letter = opt.letter || String.fromCharCode(65 + idx);
        item.dataset.letter = letter;

        const isCorrectOpt = !!opt.is_correct;
        const userPicked = (historyEntry.userAnswerLetters || []).includes(letter);

        if (isCorrectOpt) {
          item.classList.add('correct-highlight');
        } else if (userPicked) {
          item.classList.add('wrong-highlight');
        }

        const statusBadge = isCorrectOpt
          ? '<span style="color:var(--emerald);font-weight:700;font-size:0.75rem;margin-left:auto;">✓ VRAIE</span>'
          : (userPicked ? '<span style="color:var(--rose);font-weight:700;font-size:0.75rem;margin-left:auto;">✗ Votre choix</span>' : '');

        item.innerHTML = `
          <div class="option-letter">${escapeHtml(letter)}</div>
          <div class="option-text">${parseMarkdownInline(opt.text)}</div>
          ${statusBadge}
        `;
        optionsContainer.appendChild(item);
      });
    }
  }

  const expBox = document.getElementById('arena-explanation-box');
  const expText = document.getElementById('arena-explanation-text');
  if (expBox && expText) {
    if (q.explanation && q.explanation.trim()) {
      expText.innerHTML = formatMedicalContent(q.explanation.trim());
    } else {
      expText.innerHTML = `<em>Réponse officielle de référence pour le cours <strong>${escapeHtml(q.chapterTitle || modCtx.defaultChapter)}</strong>.</em>`;
    }
    expBox.style.display = 'flex';
  }

  renderArenaAiExplanation(q);
  refreshLucide();
}

window.navigateHistoryPrev = function() {
  if (appState.answeredHistory.length === 0) return;
  if (appState.historyCursor < appState.answeredHistory.length - 1) {
    appState.historyCursor++;
    renderHistoryQuestion(appState.answeredHistory[appState.historyCursor]);
  }
};

window.navigateHistoryNext = function() {
  if (appState.historyCursor > 0) {
    appState.historyCursor--;
    renderHistoryQuestion(appState.answeredHistory[appState.historyCursor]);
  } else if (appState.historyCursor === 0) {
    window.resumeActiveDrill();
  }
};

window.resumeActiveDrill = function() {
  appState.historyCursor = -1;
  loadNextArenaQuestion();
};

// ============================================================================
// QUESTION SNOOZE ENGINE
// ============================================================================
export function updateArenaSnoozePill() {
  const snoozePill = document.getElementById('arena-snooze-pill');
  const snoozeText = document.getElementById('arena-snooze-pill-text');
  if (!snoozePill) return;

  const count = queueEngine.getSnoozedCountToday();
  if (count > 0) {
    snoozePill.style.display = 'inline-flex';
    if (snoozeText) snoozeText.textContent = `${count} reporté${count > 1 ? 's' : ''}`;
  } else {
    snoozePill.style.display = 'none';
  }
}

window.snoozeCurrentQuestionForToday = function() {
  if (!appState.currentQuestion || appState.isCurrentQuestionAnswered) return;

  const qUid = appState.currentQuestion.uid;
  const res = queueEngine.snoozeQuestionForToday(qUid);
  if (!res) return;

  appState.firebaseSyncService?.triggerAutoPush();

  showAppToast('🌙 Question reportée à demain', () => {
    window.undoSnoozeQuestion(qUid);
  }, 'Annuler', 5000);

  loadNextArenaQuestion();
  updateArenaSnoozePill();
  updateDashboardUI();
  refreshLucide();
};

window.undoSnoozeQuestion = function(uid) {
  if (!uid) return;
  const restored = queueEngine.unsnoozeQuestion(uid);
  if (restored) {
    showAppToast('✅ Question réintégrée dans votre session !', { type: 'success' });
    appState.firebaseSyncService?.triggerAutoPush();
    if (!appState.currentQuestion || appState.isCurrentQuestionAnswered) {
      loadNextArenaQuestion();
    }
    updateArenaSnoozePill();
    updateDashboardUI();
    refreshLucide();
  }
};

window.promptManageSnoozedQuestions = async function() {
  const count = queueEngine.getSnoozedCountToday();
  if (count === 0) {
    showAppToast("Aucune question reportée pour aujourd'hui.");
    return;
  }
  const confirmed = await showConfirmModal({
    title: 'Questions reportées',
    message: `Vous avez ${count} question(s) reportée(s) à demain.\n\nSouhaitez-vous les réintégrer dans la session immédiatement ?`,
    confirmLabel: 'Réintégrer'
  });
  if (confirmed) {
    window.unsnoozeAllSnoozedQuestions();
  }
};

window.unsnoozeAllSnoozedQuestions = function() {
  const count = queueEngine.unsnoozeAllForToday();
  if (count > 0) {
    showAppToast(`✅ ${count} question(s) réintégrée(s) dans la session !`, { type: 'success' });
    appState.firebaseSyncService?.triggerAutoPush();
    updateArenaSnoozePill();
    updateDashboardUI();
    if (!appState.currentQuestion) {
      loadNextArenaQuestion();
    }
    refreshLucide();
  }
};

// ============================================================================
// QUIZ ARENA (QUESTION DISPLAY & SUBMISSION)
// ============================================================================
export function loadNextArenaQuestion() {
  closeSelectionTranslatePopover();
  appState.isCurrentQuestionAnswered = false;
  appState.historyCursor = -1;
  updateHistoryNavUI();

  const croqInput = document.getElementById('arena-croq-input');
  if (croqInput) {
    croqInput.disabled = false;
  }

  if (!appState.isClinicalRunActive) {
    updateClinicalRunBarUI();
    const stepperBar = document.getElementById('arena-clinical-sequential-stepper');
    if (stepperBar) stepperBar.style.display = 'none';
    const scrollContainer = document.getElementById('arena-clinical-scroll-container');
    if (scrollContainer) scrollContainer.style.display = 'none';
    const questionText = document.getElementById('arena-question-text');
    if (questionText) questionText.style.display = 'block';
  }

  appState.currentQuestion = queueEngine.getCurrentQuestion();
  appState.selectedOptionIds.clear();
  appState.isEvaluating = false;

  if (appState.currentQuestion) {
    studyTracker.startQuestionTimer();
  }

  appState.arenaChatHistory = [];
  updateArenaChatContext();
  const chatboxEl = document.getElementById('arena-ai-chatbox');
  if (chatboxEl && chatboxEl.style.display !== 'none') {
    renderChatWelcome();
  }

  const successBanner = document.getElementById('arena-success-banner');
  if (successBanner) successBanner.style.display = 'none';
  const arenaExpBox = document.getElementById('arena-explanation-box');
  if (arenaExpBox) arenaExpBox.style.display = 'none';
  const arenaAiBox = document.getElementById('arena-ai-explanation-box');
  if (arenaAiBox) arenaAiBox.style.display = 'none';
  document.querySelectorAll('.option-item').forEach(el => el.classList.remove('correct-highlight', 'wrong-highlight'));
  const defaultActions = document.getElementById('arena-default-actions');
  if (defaultActions) defaultActions.style.display = 'flex';
  const btnSnooze = document.getElementById('btn-snooze-question');
  if (btnSnooze) btnSnooze.style.display = 'inline-flex';
  updateArenaSnoozePill();

  if (!appState.currentQuestion) {
    showVictoryScreen();
    return;
  }

  const curQ = appState.currentQuestion;
  const modCtx = resolveAiModuleContext(curQ);
  const stats = queueEngine.getQuestionStats(curQ.uid);

  const chapterBadge = document.getElementById('arena-chapter-title');
  if (chapterBadge) {
    chapterBadge.classList.add('is-blurred');
    chapterBadge.classList.remove('is-revealed');
    chapterBadge.title = 'Chapitre masqué (Cliquer pour afficher)';
    const dateStr = extractQuestionDateOrSession(curQ);
    const dateBadgeHtml = dateStr ? `<span class="question-date-pill" title="Date ou session du QCM : ${escapeHtml(dateStr)}"><i data-lucide="calendar" style="width:11px;height:11px;"></i> ${escapeHtml(dateStr)}</span>` : '';
    chapterBadge.innerHTML = `
      <span class="chapter-title-text">${escapeHtml(modCtx.moduleName)} — ${escapeHtml(curQ.chapterTitle || 'Général')}${dateBadgeHtml ? ' ' + dateBadgeHtml : ''}</span>
      <span class="chapter-title-hint"><i data-lucide="eye" style="width:11px;height:11px;"></i> Cours masqué</span>
    `;
    chapterBadge.onclick = () => window.toggleArenaChapterTitle();
  }

  const typePill = document.getElementById('arena-type-pill');
  if (typePill) {
    typePill.textContent = curQ.type;
    typePill.className = `tag-pill tag-${(curQ.type || 'QCM').toLowerCase()}`;
  }

  const progressPill = document.getElementById('arena-progress-pill');
  if (progressPill) {
    if (stats.mistakes > 0) {
      progressPill.textContent = `⚠️ ${stats.current}/${stats.target} (${stats.mistakes} faute${stats.mistakes > 1 ? 's' : ''})`;
      progressPill.className = 'tag-pill progress-penalized';
    } else {
      progressPill.textContent = `✅ ${stats.current}/${stats.target} pour éliminer`;
      progressPill.className = 'tag-pill progress-pill';
    }
  }

  updateArenaDailyBadge();
  updateClinicalCaseUI(curQ);

  const qTextEl = document.getElementById('arena-question-text');
  if (qTextEl) qTextEl.innerHTML = formatMedicalContent(curQ.question || curQ.statement);

  const mediaWrap = document.getElementById('arena-media-wrap');
  if (mediaWrap) {
    if (curQ.media_urls && curQ.media_urls.length > 0) {
      mediaWrap.innerHTML = renderQuestionMedia(curQ.media_urls);
      mediaWrap.style.display = 'block';
    } else {
      mediaWrap.innerHTML = '';
      mediaWrap.style.display = 'none';
    }
  }

  const optionsContainer = document.getElementById('arena-options-container');
  const croqContainer = document.getElementById('arena-croq-container');
  const btnSubmitAnswer = document.getElementById('btn-submit-answer');
  const btnSubmitCroq = document.getElementById('btn-submit-croq');
  const shortcutHint = document.getElementById('keyboard-shortcuts-hint');
  const btnClinicalSaveNext = document.getElementById('btn-clinical-save-next');
  if (btnClinicalSaveNext) {
    btnClinicalSaveNext.style.display = 'none';
    btnClinicalSaveNext.disabled = true;
  }
  if (optionsContainer) optionsContainer.style.pointerEvents = 'auto';

  if (curQ.is_croq) {
    if (optionsContainer) optionsContainer.style.display = 'none';
    if (croqContainer) croqContainer.style.display = 'flex';
    if (croqInput) croqInput.value = '';
    if (btnSubmitAnswer) btnSubmitAnswer.style.display = 'none';
    if (btnSubmitCroq) {
      btnSubmitCroq.style.display = 'flex';
      const croqSpan = btnSubmitCroq.querySelector('span');
      if (croqSpan) croqSpan.textContent = 'Évaluer par IA (Gemini)';
      btnSubmitCroq.disabled = false;
    }
    if (shortcutHint) shortcutHint.textContent = 'Mode CROQ : Évaluation IA sémantique';
  } else {
    if (croqContainer) croqContainer.style.display = 'none';
    if (optionsContainer) optionsContainer.style.display = 'flex';
    if (btnSubmitAnswer) {
      btnSubmitAnswer.style.display = 'flex';
      btnSubmitAnswer.disabled = true;
      const ansSpan = btnSubmitAnswer.querySelector('span');
      if (ansSpan) ansSpan.textContent = 'Valider la réponse';
    }
    if (btnSubmitCroq) btnSubmitCroq.style.display = 'none';
    if (shortcutHint) shortcutHint.textContent = 'Raccourcis : [1-5] pour cocher, [Entrée] pour valider';

    renderOptionsList(curQ.options || []);
  }

  refreshLucide();
}

export function renderOptionsList(options) {
  const container = document.getElementById('arena-options-container');
  if (!container) return;
  container.innerHTML = '';

  options.forEach((opt, idx) => {
    const item = document.createElement('div');
    item.className = 'option-item';
    item.dataset.optId = opt.id || idx;
    const letter = opt.letter || String.fromCharCode(65 + idx);
    item.dataset.letter = letter;

    item.innerHTML = `
      <div class="option-letter">${escapeHtml(letter)}</div>
      <div class="option-text">${parseMarkdownInline(opt.text)}</div>
    `;

    item.addEventListener('click', () => {
      if (hasActiveTextSelection()) return;
      toggleOptionSelection(item);
    });

    container.appendChild(item);
  });
}

export function toggleOptionSelection(itemElement) {
  const optId = itemElement.dataset.optId;

  if (appState.selectedOptionIds.has(optId)) {
    appState.selectedOptionIds.delete(optId);
    itemElement.classList.remove('selected');
  } else {
    appState.selectedOptionIds.add(optId);
    itemElement.classList.add('selected');
  }

  const btnSubmit = document.getElementById('btn-submit-answer');
  if (btnSubmit) {
    btnSubmit.disabled = appState.selectedOptionIds.size === 0;
  }

  const btnClinicalSave = document.getElementById('btn-clinical-save-next');
  if (btnClinicalSave && appState.isClinicalRunActive && appState.clinicalRunState && appState.clinicalRunState.mode === 'sequential') {
    btnClinicalSave.disabled = appState.selectedOptionIds.size === 0;
  }
}

export function selectOptionByIndex(index) {
  if (!appState.currentQuestion || appState.currentQuestion.is_croq) return;
  const options = document.querySelectorAll('.option-item');
  if (options[index]) {
    toggleOptionSelection(options[index]);
  }
}

export async function handleSubmitQcm() {
  if (!appState.currentQuestion || appState.isEvaluating) return;

  if (appState.isClinicalRunActive && appState.clinicalRunState && appState.clinicalRunState.mode === 'sequential') {
    const subQ = appState.clinicalRunState.subQuestions[appState.clinicalRunState.currentIndex];
    const isAlreadyEvaluated = !!(appState.clinicalRunState.cardEvaluations && appState.clinicalRunState.cardEvaluations[subQ.uid]);
    if (isAlreadyEvaluated) {
      const isLast = appState.clinicalRunState.currentIndex === appState.clinicalRunState.subQuestions.length - 1;
      if (isLast) {
        window.validateAllClinicalSubQuestions();
      } else {
        appState.clinicalRunState.currentIndex++;
        renderClinicalSequentialView();
      }
      return;
    }

    if (appState.selectedOptionIds.size === 0) return;
    verifySequentialSubQuestion(subQ);
    return;
  }

  if (appState.selectedOptionIds.size === 0) return;

  appState.isEvaluating = true;

  const correctOptions = (appState.currentQuestion.options || []).filter(o => o.is_correct);
  const correctLetters = correctOptions.map(o => o.letter).sort();

  const selectedLetters = [];
  document.querySelectorAll('.option-item.selected').forEach(el => {
    selectedLetters.push(el.dataset.letter);
  });
  selectedLetters.sort();

  const isCorrect = (correctLetters.length === selectedLetters.length) &&
    correctLetters.every((letter, idx) => letter === selectedLetters[idx]);

  if (isCorrect) {
    handleAnswerSuccess();
  } else {
    await handleAnswerFailure(selectedLetters, correctLetters.join(', '));
  }
}

export async function handleSubmitCroq() {
  if (!appState.currentQuestion || !appState.currentQuestion.is_croq || appState.isEvaluating) return;

  if (appState.isClinicalRunActive && appState.clinicalRunState && appState.clinicalRunState.mode === 'sequential') {
    const subQ = appState.clinicalRunState.subQuestions[appState.clinicalRunState.currentIndex];
    const isAlreadyEvaluated = !!(appState.clinicalRunState.cardEvaluations && appState.clinicalRunState.cardEvaluations[subQ.uid]);
    if (isAlreadyEvaluated) {
      const isLast = appState.clinicalRunState.currentIndex === appState.clinicalRunState.subQuestions.length - 1;
      if (isLast) {
        window.validateAllClinicalSubQuestions();
      } else {
        appState.clinicalRunState.currentIndex++;
        renderClinicalSequentialView();
      }
      return;
    }

    verifySequentialCroqSubQuestion(subQ);
    return;
  }

  const userInput = document.getElementById('arena-croq-input')?.value?.trim() || '';
  if (!userInput) {
    showAppToast("Veuillez saisir votre réponse avant de lancer l'évaluation.", { type: 'warning' });
    return;
  }

  appState.isEvaluating = true;
  const btn = document.getElementById('btn-submit-croq');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader" class="spin"></i> <span>Évaluation par IA en cours...</span>`;
    refreshLucide(btn);
  }

  try {
    const evalResult = await geminiService.evaluateCroq(
      appState.currentQuestion.question,
      appState.currentQuestion.clinical_case,
      appState.currentQuestion.croq_answer,
      userInput,
      appState.currentQuestion
    );

    if (evalResult.isValid && evalResult.score >= 75) {
      handleAnswerSuccess(evalResult.score, evalResult.feedback);
    } else {
      await handleAnswerFailure(
        [userInput],
        appState.currentQuestion.croq_answer,
        true,
        evalResult.score,
        evalResult.feedback
      );
    }
  } catch (err) {
    console.error('CROQ error:', err);
    showAppToast(
      err.message && err.message.includes('API Gemini')
        ? err.message
        : "Une erreur est survenue lors de l'évaluation IA. Fallback activé.",
      { type: 'warning' }
    );
  } finally {
    appState.isEvaluating = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="sparkles"></i> <span>Évaluer par IA (Gemini)</span>`;
      refreshLucide(btn);
    }
  }
}

export function handleAnswerSuccess(score = null, _feedback = null, customLetters = null) {
  const curQ = appState.currentQuestion;
  if (!curQ) return;
  const modCtx = resolveAiModuleContext(curQ);

  let letters = customLetters;
  if (!letters) {
    if (curQ.is_croq) {
      const croqVal = document.getElementById('arena-croq-input')?.value?.trim();
      letters = croqVal ? [croqVal] : [];
    } else {
      letters = Array.from(document.querySelectorAll('.option-item.selected')).map(el => el.dataset.letter).sort();
    }
  }

  pushToAnsweredHistory(curQ, letters, true, score);

  const result = queueEngine.handleSuccess(curQ.uid);
  queueEngine.incrementTodayCount();
  studyTracker.recordAnswer(true, curQ.chapterId || null, curQ.uid || null);
  updateArenaDailyBadge();
  if (appState.currentView === 'stats') renderStatsUI();
  appState.firebaseSyncService?.triggerAutoPush();

  if (result.permanentlyRemoved) {
    triggerMasteryConfetti();
    if (curQ.clinical_case && curQ.clinical_case.trim()) {
      updateClinicalUncleanedBadge(curQ);
    }
  }

  const defaultActions = document.getElementById('arena-default-actions');
  if (defaultActions) defaultActions.style.display = 'none';
  const banner = document.getElementById('arena-success-banner');
  const bannerText = document.getElementById('arena-success-text');

  if (bannerText) {
    if (result.permanentlyRemoved) {
      bannerText.innerHTML = `<strong>Éliminée pour de bon ! 🎉</strong> Cette question a été validée avec succès (${result.target}/${result.target}) et n'apparaîtra plus.`;
    } else if (result.isPenultimate) {
      const scoreText = score ? ` (Score : ${score}%)` : '';
      bannerText.innerHTML = `<strong>Dernier palier avant élimination ! 🎯</strong> Validée ${result.newCurrent}/${result.target} fois. Placée parmi les 50% dernières questions restantes (+${result.pushDistance} cartes).`;
    } else {
      const scoreText = score ? ` (Score : ${score}%)` : '';
      bannerText.innerHTML = `<strong>Bonne réponse${scoreText} !</strong> Validée ${result.newCurrent}/${result.target} fois. Repoussée de ${result.pushDistance} cartes.`;
    }
  }

  if (banner) banner.style.display = 'flex';
  const btnSnoozeSuccess = document.getElementById('btn-snooze-question');
  if (btnSnoozeSuccess) btnSnoozeSuccess.style.display = 'none';

  if (curQ.options) {
    document.querySelectorAll('.option-item').forEach(el => {
      const letter = el.dataset.letter;
      const isCor = (curQ.options || []).some(o => o.letter === letter && o.is_correct);
      if (isCor) {
        el.classList.add('correct-highlight');
      }
    });
  }

  const expBox = document.getElementById('arena-explanation-box');
  const expText = document.getElementById('arena-explanation-text');
  if (expBox && expText) {
    if (curQ.explanation && curQ.explanation.trim()) {
      expText.innerHTML = formatMedicalContent(curQ.explanation.trim());
    } else {
      expText.innerHTML = `<em>Réponse officielle validée conformément aux critères du cours <strong>${escapeHtml(curQ.chapterTitle || modCtx.defaultChapter)}</strong>.</em>`;
    }
    expBox.style.display = 'flex';
  }

  renderArenaAiExplanation(curQ);

  appState.isCurrentQuestionAnswered = true;
  window.toggleArenaChapterTitle(true);
  const views = getDomViews();
  refreshLucide(views.arena);
}

export async function handleAnswerFailure(userAnswerLetters, correctAnswerText, isCroq = false, score = 0, _feedback = '') {
  const targetQuestion = appState.currentQuestion;
  if (!targetQuestion) return;
  const targetUid = targetQuestion.uid;
  const modals = getDomModals();

  pushToAnsweredHistory(targetQuestion, userAnswerLetters, false, score);

  const result = queueEngine.handleFailure(targetUid);
  studyTracker.recordAnswer(false, targetQuestion.chapterId || null, targetUid);
  updateArenaDailyBadge();
  if (appState.currentView === 'stats') renderStatsUI();
  appState.firebaseSyncService?.triggerAutoPush();
  appState.isCurrentQuestionAnswered = true;

  const btnSnoozeFail = document.getElementById('btn-snooze-question');
  if (btnSnoozeFail) btnSnoozeFail.style.display = 'none';
  window.toggleArenaChapterTitle(true);

  let penaltyTitle = '';
  let penaltyDesc = '';

  if (result.newTarget >= 10) {
    if (result.decremented) {
      penaltyTitle = `Plafond de 10 atteint : progression diminuée (${result.previousCurrent}/10 ➔ ${result.current}/10)`;
      penaltyDesc = `Cette question a été ratée (${result.mistakes} faute${result.mistakes > 1 ? 's' : ''}). Le seuil étant plafonné à 10, votre progression diminue de ${result.previousCurrent}/10 à ${result.current}/10. Elle réapparaîtra dans ${result.pushDistance} cartes.`;
    } else {
      penaltyTitle = 'Pénalité maximale : seuil plafonné à 10 réussites requises';
      penaltyDesc = `Cette question a été ratée (${result.mistakes} faute${result.mistakes > 1 ? 's' : ''}). Progression actuelle : ${result.current}/10. Elle réapparaîtra dans ${result.pushDistance} cartes pour ancrer le bon réflexe.`;
    }
  } else {
    penaltyTitle = `Pénalité appliquée : seuil augmenté à ${result.newTarget} réussites requises`;
    penaltyDesc = `Cette question a été ratée (${result.mistakes} faute${result.mistakes > 1 ? 's' : ''}). Progression actuelle : ${result.current}/${result.newTarget}. Elle réapparaîtra dans ${result.pushDistance} cartes pour ancrer le bon réflexe.`;
  }

  const errTitleEl = document.getElementById('error-modal-penalty-title');
  const errDescEl = document.getElementById('error-modal-penalty-desc');
  if (errTitleEl) errTitleEl.textContent = penaltyTitle;
  if (errDescEl) errDescEl.textContent = penaltyDesc;

  const userText = isCroq ? (userAnswerLetters[0] || '') : (userAnswerLetters.join(', ') || 'Aucune réponse cochée');
  const comparisonContainer = document.getElementById('error-modal-comparison-container')
    || document.querySelector('.answer-recap-box');

  if (comparisonContainer) {
    const recapHtml = formatQuestionMistakeRecap(targetQuestion, userAnswerLetters, isCroq, userText, score);
    comparisonContainer.outerHTML = `<div id="error-modal-comparison-container">${recapHtml}</div>`;
  }

  if (targetQuestion.options) {
    document.querySelectorAll('.option-item').forEach(el => {
      const letter = el.dataset.letter;
      const isSelected = userAnswerLetters.includes(letter);
      const isCor = (targetQuestion.options || []).some(o => o.letter === letter && o.is_correct);

      if (isSelected && !isCor) {
        el.classList.add('wrong-highlight');
      } else if (isCor) {
        el.classList.add('correct-highlight');
      }
    });
  }

  const aiNoteContainer = document.getElementById('error-modal-ai-note');
  if (modals.error) {
    modals.error.dataset.questionUid = targetUid;
    modals.error.style.display = 'flex';
  }
  if (aiNoteContainer) {
    aiNoteContainer.innerHTML = `
      <div class="reasoning-loader-wrap">
        <i data-lucide="sparkles" class="spin"></i>
        <span>Consultation de l'IA Flash et formulation de la démarche clinique complète...</span>
      </div>
    `;
  }
  refreshLucide(modals.error);

  let reasoningObj;
  try {
    reasoningObj = await geminiService.generateReasoningNote(
      targetQuestion,
      userAnswerLetters,
      isCroq,
      userAnswerLetters[0] || ''
    );
  } catch (err) {
    reasoningObj = {
      note: targetQuestion.explanation || 'Réponse officielle enregistrée.',
      modelUsed: 'Moteur Local (Hors-Ligne)'
    };
  }

  saveAiExplanationForQuestion(targetUid, reasoningObj.note, reasoningObj.modelUsed, targetQuestion);

  if (modals.error && modals.error.style.display === 'flex' && modals.error.dataset.questionUid === targetUid) {
    if (aiNoteContainer) aiNoteContainer.innerHTML = formatReasoningNote(reasoningObj.note);
    const errModelTag = document.getElementById('error-modal-model-tag');
    if (errModelTag) errModelTag.textContent = reasoningObj.modelUsed;
    refreshLucide(modals.error);
  }

  const noteRecord = {
    id: `note_${Date.now()}`,
    questionUid: targetUid,
    questionText: targetQuestion.question,
    clinicalCase: targetQuestion.clinical_case || null,
    chapterTitle: targetQuestion.chapterTitle,
    options: targetQuestion.options ? JSON.parse(JSON.stringify(targetQuestion.options)) : [],
    media_urls: targetQuestion.media_urls || [],
    userAnswer: userText,
    userAnswerLetters: Array.isArray(userAnswerLetters) ? userAnswerLetters : [userAnswerLetters],
    correctAnswer: correctAnswerText,
    officialExplanation: targetQuestion.explanation || '',
    isCroq: !!isCroq,
    score: isCroq ? score : null,
    reasoningNote: reasoningObj.note,
    modelUsed: reasoningObj.modelUsed,
    timestamp: Date.now()
  };
  queueEngine.saveReasoningNote(noteRecord);
  appState.firebaseSyncService?.triggerAutoPush();

  const notesCount = queueEngine.getRawReasoningNotes().length;
  const badgeEl = document.getElementById('notebook-count-badge');
  if (badgeEl) badgeEl.textContent = notesCount;

  refreshLucide(modals.error);
}

export function closeErrorModalAndContinue() {
  const modals = getDomModals();
  if (modals.error) modals.error.style.display = 'none';
  loadNextArenaQuestion();
}

export function showVictoryScreen() {
  const snoozedCount = queueEngine.getSnoozedCountToday();
  const btnSnooze = document.getElementById('btn-snooze-question');
  if (btnSnooze) btnSnooze.style.display = 'none';

  const qTextEl = document.getElementById('arena-question-text');
  if (qTextEl) {
    if (snoozedCount > 0) {
      qTextEl.innerHTML = `
        <div style="text-align:center;padding:30px 10px;">
          <div style="font-size:3rem;margin-bottom:12px;">🌙</div>
          <h2 style="font-family:var(--font-heading);font-size:1.8rem;color:#c084fc;margin-bottom:8px;">
            File active terminée pour aujourd'hui !
          </h2>
          <p style="color:var(--text-muted);font-size:1rem;max-width:520px;margin:0 auto 20px;">
            Toutes les questions actives ont été travaillées. Vous avez <strong>${snoozedCount} question${snoozedCount > 1 ? 's' : ''} reportée${snoozedCount > 1 ? 's' : ''} à demain</strong>.
          </p>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            <button class="btn-primary-large" id="btn-victory-unsnooze" style="margin:0;">
              <span>Réintégrer les questions reportées</span>
            </button>
            <button class="btn-secondary" id="btn-victory-home" style="margin:0;">
              <span>Retour au Dashboard</span>
            </button>
          </div>
        </div>
      `;
      const btnUnsnooze = document.getElementById('btn-victory-unsnooze');
      if (btnUnsnooze) btnUnsnooze.onclick = () => window.unsnoozeAllSnoozedQuestions();
    } else {
      qTextEl.innerHTML = `
        <div style="text-align:center;padding:30px 10px;">
          <div style="font-size:3rem;margin-bottom:12px;">🏆</div>
          <h2 style="font-family:var(--font-heading);font-size:1.8rem;color:var(--emerald);margin-bottom:8px;">
            Félicitations Majeur de Promo !
          </h2>
          <p style="color:var(--text-muted);font-size:1rem;max-width:500px;margin:0 auto 20px;">
            Toutes les questions sélectionnées ont été nettoyées et validées jusqu'à leur seuil de maîtrise.
          </p>
          <button class="btn-primary-large" id="btn-victory-home" style="margin:0 auto;">
            Retour au Dashboard
          </button>
        </div>
      `;
      triggerMasteryConfetti();
    }
  }

  const optionsContainer = document.getElementById('arena-options-container');
  const croqContainer = document.getElementById('arena-croq-container');
  const defaultActions = document.getElementById('arena-default-actions');
  if (optionsContainer) optionsContainer.innerHTML = '';
  if (croqContainer) croqContainer.style.display = 'none';
  if (defaultActions) defaultActions.style.display = 'none';

  const btnHome = document.getElementById('btn-victory-home');
  if (btnHome) btnHome.onclick = () => navigateToView('dashboard');
}

// ============================================================================
// ARENA AI TUTOR CHAT CONTROLLER
// ============================================================================
function renderExistingChatMessages() {
  const listEl = document.getElementById('chatbox-messages-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  renderChatWelcome();
  appState.arenaChatHistory.forEach(msg => {
    const bubble = document.createElement('div');
    if (msg.role === 'user') {
      bubble.className = 'chat-bubble bubble-user';
      bubble.textContent = msg.text;
    } else {
      bubble.className = 'chat-bubble bubble-ai';
      bubble.innerHTML = formatMedicalContent(msg.text);
    }
    listEl.appendChild(bubble);
  });
  listEl.scrollTop = listEl.scrollHeight;
  refreshLucide(listEl);
}

window.toggleArenaChat = function(forceOpen = null) {
  const chatbox = document.getElementById('arena-ai-chatbox');
  const btn = document.getElementById('btn-arena-ai-chat');
  if (!chatbox) return;

  const isOpen = (forceOpen !== null) ? !forceOpen : (chatbox.style.display !== 'none');
  if (isOpen) {
    chatbox.style.display = 'none';
    if (btn) btn.classList.remove('is-active');
  } else {
    chatbox.style.display = 'flex';
    if (btn) btn.classList.add('is-active');
    updateArenaChatContext();
    if (appState.arenaChatHistory.length === 0) {
      renderChatWelcome();
    } else {
      renderExistingChatMessages();
    }
    const inputEl = document.getElementById('chatbox-text-input');
    if (inputEl) setTimeout(() => inputEl.focus(), 150);
  }
  refreshLucide(chatbox);
};

window.clearArenaChat = function() {
  const effQ = getEffectiveArenaQuestion();
  appState.arenaChatHistory = [];
  if (effQ && effQ.uid) {
    delete appState.questionChatHistories[effQ.uid];
  }
  renderChatWelcome();
  const inputEl = document.getElementById('chatbox-text-input');
  if (inputEl) inputEl.value = '';
};

window.sendChatPrompt = function(promptText) {
  if (!promptText || !promptText.trim()) return;
  const inputEl = document.getElementById('chatbox-text-input');
  if (inputEl) inputEl.value = promptText;
  executeSendMessage(promptText.trim());
};

window.handleChatSubmit = function(event) {
  if (event) event.preventDefault();
  const inputEl = document.getElementById('chatbox-text-input');
  if (!inputEl) return;
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  executeSendMessage(text);
};

export function updateArenaChatContext() {
  const qTextEl = document.getElementById('chatbox-q-statement');
  const ctxEl = document.getElementById('chatbox-current-context');
  const effQ = getEffectiveArenaQuestion();
  const modCtx = resolveAiModuleContext(effQ);

  const chatTutorTitle = document.getElementById('chatbox-tutor-title');
  if (chatTutorTitle) {
    chatTutorTitle.textContent = `Tuteur IA ${modCtx.moduleName}`;
  }

  if (effQ) {
    appState.arenaChatHistory = appState.questionChatHistories[effQ.uid] ? [...appState.questionChatHistories[effQ.uid]] : [];
    const chatbox = document.getElementById('arena-ai-chatbox');
    if (chatbox && chatbox.style.display !== 'none') {
      if (appState.arenaChatHistory.length > 0) {
        renderExistingChatMessages();
      } else {
        renderChatWelcome();
      }
    }

    const clinicalCtx = buildClinicalCaseContext(effQ);

    if (qTextEl) {
      if (clinicalCtx && clinicalCtx.isClinicalCase) {
        const qStatement = effQ.question || effQ.statement || '';
        qTextEl.textContent = `Cas Clinique (Q${clinicalCtx.currentNum}/${clinicalCtx.totalCount}) : ${qStatement.length > 70 ? qStatement.slice(0, 70) + '...' : qStatement}`;
      } else {
        const qText = effQ.question || effQ.statement || `Question ${modCtx.moduleName}`;
        qTextEl.textContent = qText.length > 80 ? qText.slice(0, 80) + '...' : qText;
      }
    }
    if (ctxEl) {
      if (clinicalCtx && clinicalCtx.isClinicalCase) {
        const prefixStr = clinicalCtx.casePrefix ? `Cas Clinique ${clinicalCtx.casePrefix}` : 'Cas Clinique';
        ctxEl.innerHTML = `<span style="color:var(--cyan);font-weight:700;">${escapeHtml(prefixStr)}</span> • Question ${clinicalCtx.currentNum}/${clinicalCtx.totalCount} <span style="font-size:0.68rem;background:rgba(0,212,255,0.15);padding:1px 6px;border-radius:4px;color:var(--cyan);margin-left:4px;">Contexte Q1-${clinicalCtx.currentNum} actif</span>`;
      } else {
        const isHistory = appState.historyCursor >= 0;
        const isRevealed = isArenaChapterRevealed();
        const blurClass = isRevealed ? 'is-revealed' : 'is-blurred';
        const blurTitle = isRevealed
          ? 'Cours visible (Cliquer pour masquer)'
          : "Cours masqué jusqu'à ce que vous répondiez (Cliquer pour afficher)";
        const histSuffix = isHistory ? ` (QCM -${appState.historyCursor + 1})` : '';

        ctxEl.innerHTML = `${escapeHtml(modCtx.moduleName)} — <span class="chatbox-chapter-blurred ${blurClass}" onclick="window.toggleArenaChapterTitle()" title="${blurTitle}">${escapeHtml(effQ.chapterTitle || 'Général')}</span>${histSuffix}`;
      }
    }
  }
}

export function renderChatWelcome() {
  const listEl = document.getElementById('chatbox-messages-list');
  if (!listEl) return;
  const effQ = getEffectiveArenaQuestion();
  const modCtx = resolveAiModuleContext(effQ);
  const chapTitle = effQ ? (effQ.chapterTitle || modCtx.defaultChapter) : modCtx.defaultChapter;
  const isHistory = appState.historyCursor >= 0;
  const isRevealed = isArenaChapterRevealed();
  const blurClass = isRevealed ? 'is-revealed' : 'is-blurred';
  const blurTitle = isRevealed
    ? 'Cours visible (Cliquer pour masquer)'
    : "Cours masqué jusqu'à ce que vous répondiez (Cliquer pour afficher)";

  const clinicalCtx = effQ ? buildClinicalCaseContext(effQ) : null;

  if (clinicalCtx && clinicalCtx.isClinicalCase) {
    listEl.innerHTML = `
      <div class="chat-bubble bubble-ai">
        <p>👋 Bonjour ! Je suis votre <strong>${escapeHtml(modCtx.tutorTitle)}</strong>.</p>
        <p>🎯 <strong>Contexte Intégral du Cas Clinique Activé :</strong></p>
        <p>J'ai sous les yeux l'énoncé complet du cas ainsi que l'évolution des <strong>questions 1 à ${clinicalCtx.currentNum} sur ${clinicalCtx.totalCount}</strong> avec leurs énoncés, propositions, réponses et explications.</p>
        <p style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">
          Posez-moi votre question sur ce dossier ou cliquez sur une suggestion rapide :
        </p>
      </div>
    `;
  } else {
    listEl.innerHTML = `
      <div class="chat-bubble bubble-ai">
        <p>👋 Bonjour ! Je suis votre <strong>${escapeHtml(modCtx.tutorTitle)}</strong>.</p>
        <p>Je connais par cœur l'énoncé, le cas clinique, les propositions et la justification officielle de ce QCM ${isHistory ? '<strong>en cours de consultation</strong>' : ''} en <strong class="chatbox-chapter-blurred ${blurClass}" onclick="window.toggleArenaChapterTitle()" title="${blurTitle}">${escapeHtml(chapTitle)}</strong>.</p>
        <p style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">
          Posez-moi votre question directement ou cliquez sur une suggestion rapide :
        </p>
      </div>
    `;
  }
}

async function executeSendMessage(userText) {
  const effQ = getEffectiveArenaQuestion();
  if (!effQ) return;
  const targetUid = effQ.uid;
  const listEl = document.getElementById('chatbox-messages-list');
  if (!listEl) return;

  appState.arenaChatHistory.push({ role: 'user', text: userText, timestamp: Date.now() });
  if (targetUid) {
    appState.questionChatHistories[targetUid] = [...appState.arenaChatHistory];
  }

  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble bubble-user';
  userBubble.textContent = userText;
  listEl.appendChild(userBubble);
  listEl.scrollTop = listEl.scrollHeight;

  const loadingBubble = document.createElement('div');
  loadingBubble.className = 'chat-bubble bubble-ai is-loading';
  loadingBubble.id = 'chatbox-loading-indicator';
  loadingBubble.innerHTML = `
    <div class="typing-indicator"><span></span><span></span><span></span></div>
    <span>Gemini Flash analyse ce QCM...</span>
  `;
  listEl.appendChild(loadingBubble);
  listEl.scrollTop = listEl.scrollHeight;

  const sendBtn = document.getElementById('btn-chat-send');
  const inputEl = document.getElementById('chatbox-text-input');
  if (sendBtn) sendBtn.disabled = true;
  if (inputEl) inputEl.disabled = true;

  try {
    const historyForAi = appState.arenaChatHistory.slice(0, -1);
    const clinicalContext = buildClinicalCaseContext(effQ);
    const response = await geminiService.askAboutQuestion(effQ, historyForAi, userText, clinicalContext);

    if (targetUid) {
      if (!appState.questionChatHistories[targetUid]) appState.questionChatHistories[targetUid] = [];
      appState.questionChatHistories[targetUid].push({ role: 'ai', text: response.text, modelUsed: response.modelUsed, timestamp: Date.now() });
    }

    const currentEffQ = getEffectiveArenaQuestion();
    if (currentEffQ && currentEffQ.uid === targetUid) {
      const existingLoader = document.getElementById('chatbox-loading-indicator');
      if (existingLoader) existingLoader.remove();

      appState.arenaChatHistory = [...appState.questionChatHistories[targetUid]];
      const aiBubble = document.createElement('div');
      aiBubble.className = 'chat-bubble bubble-ai';
      aiBubble.innerHTML = formatMedicalContent(response.text);
      listEl.appendChild(aiBubble);

      const modelTag = document.getElementById('chatbox-model-tag');
      if (modelTag && response.modelUsed) {
        modelTag.textContent = response.modelUsed;
      }
    }
  } catch (err) {
    console.error('Chat error:', err);
    const currentEffQ = getEffectiveArenaQuestion();
    if (currentEffQ && currentEffQ.uid === targetUid) {
      const existingLoader = document.getElementById('chatbox-loading-indicator');
      if (existingLoader) existingLoader.remove();

      const errBubble = document.createElement('div');
      errBubble.className = 'chat-bubble bubble-ai';
      errBubble.innerHTML = `⚠️ ${escapeHtml(err.message || 'Erreur de réponse IA')}`;
      listEl.appendChild(errBubble);
    }
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    if (inputEl) {
      inputEl.disabled = false;
      inputEl.focus();
    }
    listEl.scrollTop = listEl.scrollHeight;
    refreshLucide(listEl);
  }
}
