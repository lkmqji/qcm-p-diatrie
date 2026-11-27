// ============================================================================
// Carnet de Raisonnement IA & Sélection des Chapitres
// ============================================================================
import {
  appState,
  queueEngine,
  getDomViews,
  getDomModals
} from '../state/appState.js';
import { getActiveModuleId } from '../services/moduleCatalog.js';
import { resolveAiModuleContext } from '../services/gemini.js';
import {
  escapeHtml,
  formatReasoningNote
} from '../utils/formatters.js';
import { refreshLucide } from '../utils/uiDialogs.js';
import { updateDashboardUI } from './dashboardView.js';
import {
  formatQuestionMistakeRecap,
  findQuestionAcrossDatasets
} from './arenaView.js';

export const NOTEBOOK_PAGE_SIZE = 30;

let notebookSelectedChapter = '';
let notebookSortBy = 'date'; // 'date' | 'mistakes' | 'chapter' | 'score'
let notebookSortOrder = 'desc'; // 'desc' | 'asc'
let notebookViewMode = 'chapter'; // 'chapter' | 'flat'
let notebookVisibleLimit = NOTEBOOK_PAGE_SIZE;

export function resetNotebookViewFilters() {
  notebookSelectedChapter = '';
  notebookVisibleLimit = NOTEBOOK_PAGE_SIZE;
  const chapFilterSelect = document.getElementById('notebook-chapter-filter');
  if (chapFilterSelect) chapFilterSelect.value = '';
  const notebookSearch = document.getElementById('notebook-search-input');
  if (notebookSearch) notebookSearch.value = '';
}

export function setNotebookSortBy(sortBy) {
  notebookSortBy = sortBy || 'date';
  notebookVisibleLimit = NOTEBOOK_PAGE_SIZE;
}

export function toggleNotebookSortOrder() {
  notebookSortOrder = (notebookSortOrder === 'desc') ? 'asc' : 'desc';
  notebookVisibleLimit = NOTEBOOK_PAGE_SIZE;
  updateSortOrderButtonUI();
}

export function setNotebookViewMode(mode) {
  notebookViewMode = (mode === 'flat') ? 'flat' : 'chapter';
  notebookVisibleLimit = NOTEBOOK_PAGE_SIZE;
}

export function setNotebookSelectedChapter(chapterTitle) {
  notebookSelectedChapter = chapterTitle || '';
  notebookVisibleLimit = NOTEBOOK_PAGE_SIZE;
}

function compareQuestions(qA, qB, sortBy, sortOrder) {
  let valA;
  let valB;

  if (sortBy === 'date') {
    valA = qA.latestTimestamp || 0;
    valB = qB.latestTimestamp || 0;
  } else if (sortBy === 'mistakes') {
    valA = qA.totalMistakes || 0;
    valB = qB.totalMistakes || 0;
    if (valA === valB) {
      valA = qA.latestTimestamp || 0;
      valB = qB.latestTimestamp || 0;
    }
  } else if (sortBy === 'chapter') {
    const cmp = (qA.chapterTitle || '').localeCompare(qB.chapterTitle || '', 'fr');
    return sortOrder === 'asc' ? cmp : -cmp;
  } else if (sortBy === 'score') {
    valA = (qA.latestScore !== null && qA.latestScore !== undefined) ? qA.latestScore : (qA.isCroq ? 0 : 100);
    valB = (qB.latestScore !== null && qB.latestScore !== undefined) ? qB.latestScore : (qB.isCroq ? 0 : 100);
  } else {
    valA = qA.latestTimestamp || 0;
    valB = qB.latestTimestamp || 0;
  }

  if (sortOrder === 'asc') {
    return valA > valB ? 1 : (valA < valB ? -1 : 0);
  }
  return valA < valB ? 1 : (valA > valB ? -1 : 0);
}

function getSortSummaryLabel() {
  const dirText = notebookSortOrder === 'desc' ? 'Décroissant ⬇' : 'Croissant ⬆';
  let critText = 'Date de faute';
  if (notebookSortBy === 'mistakes') critText = "Nombre d'erreurs";
  else if (notebookSortBy === 'chapter') critText = 'Ordre alphabétique des cours';
  else if (notebookSortBy === 'score') critText = 'Score CROQ';
  return `${critText} (${dirText})`;
}

export function updateSortOrderButtonUI() {
  const btn = document.getElementById('btn-toggle-sort-order');
  const label = document.getElementById('sort-order-label');
  const icon = document.getElementById('sort-order-icon');
  if (!btn || !label) return;

  if (notebookSortOrder === 'desc') {
    label.textContent = 'Décroissant ⬇';
    btn.setAttribute('data-order', 'desc');
    btn.title = 'Ordre actuel : Décroissant (Max ➔ Min). Cliquer pour passer en Croissant.';
    if (icon) icon.setAttribute('data-lucide', 'arrow-down-wide-narrow');
  } else {
    label.textContent = 'Croissant ⬆';
    btn.setAttribute('data-order', 'asc');
    btn.title = 'Ordre actuel : Croissant (Min ➔ Max). Cliquer pour passer en Décroissant.';
    if (icon) icon.setAttribute('data-lucide', 'arrow-up-narrow-wide');
  }
  refreshLucide(btn);
}

function renderQuestionCard(q, gIdx, qIdx, rankNumber = null) {
  const qDomId = `qcard_${gIdx}_${qIdx}`;
  const latestAttempt = q.attempts[0];
  const latestDateStr = latestAttempt.timestamp
    ? new Date(latestAttempt.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  let switcherHtml = '';
  if (q.attempts.length > 1) {
    switcherHtml = `
      <div class="attempts-switcher-bar">
        ${q.attempts.map((att, attIdx) => {
          const timeStr = att.timestamp
            ? new Date(att.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
            : `Tentative ${q.attempts.length - attIdx}`;
          const scoreBadge = (att.score !== null && att.score !== undefined) ? `<span class="badge-pill-micro">${att.score}%</span>` : '';
          const label = (attIdx === 0) ? `✨ Dernière analyse (#${q.attempts.length})` : `Tentative #${q.attempts.length - attIdx}`;
          return `
            <button class="attempt-tab-btn ${attIdx === 0 ? 'active' : ''}" onclick="window.switchAttemptTab('${qDomId}', ${attIdx}, this)">
              <span>${label}</span>
              <span class="badge-pill-micro">${timeStr}</span>
              ${scoreBadge}
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  const panelsHtml = q.attempts.map((att, attIdx) => {
    let fullQ = findQuestionAcrossDatasets(att.questionUid);
    if (!fullQ) {
      fullQ = {
        uid: att.questionUid,
        question: att.questionText,
        clinical_case: att.clinicalCase || null,
        chapterTitle: att.chapterTitle || q.chapterTitle,
        options: att.options || [],
        explanation: att.officialExplanation || '',
        croq_answer: att.correctAnswer || ''
      };
    }
    if (!fullQ.media_urls && att.media_urls) {
      fullQ.media_urls = att.media_urls;
    }
    const letters = att.userAnswerLetters || (att.userAnswer ? att.userAnswer.split(',').map(s => s.trim().toUpperCase()) : []);
    const recapHtml = formatQuestionMistakeRecap(fullQ, letters, q.isCroq, att.userAnswer, att.score);
    const reasHtml = formatReasoningNote(att.reasoningNote);

    return `
      <div class="attempt-panel" id="${qDomId}_att_${attIdx}" style="${attIdx === 0 ? '' : 'display:none;'}">
        ${recapHtml}
        <div class="notebook-reasoning-section">
          <div class="notebook-reasoning-title">
            <i data-lucide="sparkles" style="width:16px;height:16px;color:var(--cyan);"></i>
            <span>Méthode &amp; Analyse Clinique Approfondie (IA Flash)</span>
          </div>
          ${reasHtml}
        </div>
      </div>
    `;
  }).join('');

  const rankBadgeHtml = rankNumber !== null ? `
    <span class="note-stat-badge stat-rank" title="Classement selon le critère de tri">
      #${rankNumber}
    </span>
  ` : '';

  const mistakesBadgeHtml = `
    <span class="note-stat-badge stat-mistakes" title="${q.totalMistakes} erreur(s) enregistrée(s)">
      <i data-lucide="alert-triangle" style="width:12px;height:12px;"></i>
      ${q.totalMistakes} faute${q.totalMistakes > 1 ? 's' : ''}
    </span>
  `;

  const scoreBadgeHtml = (q.isCroq && q.latestScore !== null && q.latestScore !== undefined) ? `
    <span class="note-stat-badge ${q.latestScore >= 75 ? 'stat-score' : 'stat-mistakes'}" title="Score obtenu au CROQ">
      Score : ${q.latestScore}%
    </span>
  ` : '';

  const questionPreview = q.questionText ? escapeHtml(q.questionText) : 'Question médicale';

  return `
    <div class="note-card grouped-question-card" id="${qDomId}">
      <div class="note-card-header clickable-question-header" onclick="window.toggleQuestionCard('${qDomId}', event)" title="Cliquer pour replier ou déplier cette question">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <i data-lucide="chevron-down" class="question-chevron"></i>
          ${rankBadgeHtml}
          <span class="note-chapter">${escapeHtml(q.chapterTitle)}</span>
          <span class="tag-pill ${q.isCroq ? 'tag-croq' : 'tag-qcu'}" style="font-size:0.68rem;padding:2px 8px;">
            ${q.isCroq ? 'CROQ' : 'QCM'}
          </span>
          ${mistakesBadgeHtml}
          ${scoreBadgeHtml}
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          ${q.attemptsCount > 1 ? `
            <span class="attempts-history-badge">
              <i data-lucide="history" style="width:13px;height:13px;"></i>
              ${q.attemptsCount} tentatives
            </span>
          ` : ''}
          <span class="note-date"><i data-lucide="calendar" style="width:11px;height:11px;display:inline;vertical-align:middle;margin-right:2px;"></i>${latestDateStr}</span>
        </div>
      </div>
      <div class="question-collapsed-preview" onclick="window.toggleQuestionCard('${qDomId}', event)" title="Cliquer pour déplier l'analyse complète de la question">
        <i data-lucide="file-text" style="width:14px;height:14px;color:var(--cyan);flex-shrink:0;"></i>
        <span class="question-collapsed-text">${questionPreview}</span>
      </div>
      ${switcherHtml}
      <div class="attempt-content-container">
        ${panelsHtml}
      </div>
    </div>
  `;
}

function resolveDefaultChapterForModule() {
  const ctx = resolveAiModuleContext({ chapterTitle: '' });
  return ctx.defaultChapter || `${ctx.moduleName} Générale`;
}

function groupNotesByChapterAndQuestion(notes) {
  const chapterMap = new Map();
  const defaultGeneralChap = resolveDefaultChapterForModule();

  notes.forEach(note => {
    const fullQ = findQuestionAcrossDatasets(note.questionUid);
    const noteCtx = note.questionUid && note.questionUid.startsWith('psy_')
      ? resolveAiModuleContext({ uid: note.questionUid })
      : null;
    const noteChapFallback = noteCtx ? noteCtx.defaultChapter : defaultGeneralChap;
    const chap = (fullQ && fullQ.chapterTitle) || (note.chapterTitle && note.chapterTitle.trim()) || noteChapFallback;
    const qKey = note.questionUid || (fullQ && fullQ.question) || note.questionText || note.id;

    if (!chapterMap.has(chap)) {
      chapterMap.set(chap, new Map());
    }
    const qMap = chapterMap.get(chap);
    if (!qMap.has(qKey)) {
      qMap.set(qKey, []);
    }
    qMap.get(qKey).push(note);
  });

  const result = [];
  for (const [chapTitle, qMap] of chapterMap.entries()) {
    const questions = [];

    for (const [qKey, attempts] of qMap.entries()) {
      attempts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      const primary = attempts[0];
      const isCroq = primary.isCroq || (primary.correctAnswer && primary.correctAnswer.length > 50) || (primary.userAnswer && primary.userAnswer.length > 30);
      const stats = queueEngine.getQuestionStats(primary.questionUid);
      const totalMistakes = Math.max(attempts.length, (stats ? stats.mistakes : 0));
      const latestTimestamp = attempts[0]?.timestamp || 0;
      const latestScore = (attempts[0]?.score !== null && attempts[0]?.score !== undefined) ? attempts[0].score : (isCroq ? 0 : null);

      questions.push({
        questionKey: qKey,
        questionUid: primary.questionUid,
        questionText: primary.questionText,
        chapterTitle: chapTitle,
        isCroq: !!isCroq,
        attemptsCount: attempts.length,
        totalMistakes,
        latestTimestamp,
        latestScore,
        attempts
      });
    }

    questions.sort((a, b) => compareQuestions(a, b, notebookSortBy, notebookSortOrder));

    const chapterLatestTimestamp = Math.max(...questions.map(q => q.latestTimestamp || 0), 0);
    const chapterTotalMistakes = questions.reduce((sum, q) => sum + q.totalMistakes, 0);

    result.push({
      chapterTitle: chapTitle,
      totalQuestions: questions.length,
      totalNotes: questions.reduce((sum, q) => sum + q.attemptsCount, 0),
      chapterLatestTimestamp,
      chapterTotalMistakes,
      questions
    });
  }

  result.sort((cA, cB) => {
    if (notebookSortBy === 'date') {
      return notebookSortOrder === 'asc'
        ? cA.chapterLatestTimestamp - cB.chapterLatestTimestamp
        : cB.chapterLatestTimestamp - cA.chapterLatestTimestamp;
    }
    if (notebookSortBy === 'mistakes') {
      return notebookSortOrder === 'asc'
        ? cA.chapterTotalMistakes - cB.chapterTotalMistakes
        : cB.chapterTotalMistakes - cA.chapterTotalMistakes;
    }
    if (notebookSortBy === 'chapter') {
      const cmp = cA.chapterTitle.localeCompare(cB.chapterTitle, 'fr');
      return notebookSortOrder === 'asc' ? cmp : -cmp;
    }
    if (notebookSortBy === 'score') {
      const avgA = cA.questions.reduce((s, q) => s + (q.latestScore ?? 50), 0) / (cA.questions.length || 1);
      const avgB = cB.questions.reduce((s, q) => s + (q.latestScore ?? 50), 0) / (cB.questions.length || 1);
      return notebookSortOrder === 'asc' ? avgA - avgB : avgB - avgA;
    }
    return cB.chapterLatestTimestamp - cA.chapterLatestTimestamp;
  });

  return result;
}

window.switchAttemptTab = function(qDomId, activeIdx, clickedBtn) {
  const parentBar = clickedBtn.closest('.attempts-switcher-bar');
  if (parentBar) {
    parentBar.querySelectorAll('.attempt-tab-btn').forEach(b => b.classList.remove('active'));
    clickedBtn.classList.add('active');
  }
  const card = document.getElementById(qDomId);
  if (card) {
    card.querySelectorAll('.attempt-panel').forEach((p, idx) => {
      p.style.display = (idx === activeIdx) ? 'block' : 'none';
    });
  }
};

window.toggleChapterGroup = function(groupId) {
  const el = document.getElementById(groupId);
  if (el) {
    el.classList.toggle('collapsed');
  }
};

window.toggleQuestionCard = function(cardId, e) {
  if (e && (e.target.closest('.attempt-tab-btn') || e.target.closest('button') || e.target.closest('a'))) {
    return;
  }
  const card = document.getElementById(cardId);
  if (card) {
    card.classList.toggle('collapsed');
  }
};

window.toggleAllChapters = function() {
  const allGroups = document.querySelectorAll('.notebook-chapter-group');
  const allCards = document.querySelectorAll('.grouped-question-card');

  const hasExpandedGroups = Array.from(allGroups).some(g => !g.classList.contains('collapsed'));
  const hasExpandedCards = Array.from(allCards).some(c => !c.classList.contains('collapsed'));
  const shouldCollapse = hasExpandedGroups || (allGroups.length === 0 && hasExpandedCards);

  allGroups.forEach(g => g.classList.toggle('collapsed', shouldCollapse));
  allCards.forEach(c => c.classList.toggle('collapsed', shouldCollapse));

  const btnText = document.getElementById('btn-toggle-all-chapters-text');
  if (btnText) {
    btnText.textContent = shouldCollapse ? 'Tout déplier' : 'Tout replier';
  }
};

window.loadMoreNotebookNotes = function() {
  notebookVisibleLimit += NOTEBOOK_PAGE_SIZE;
  const searchVal = document.getElementById('notebook-search-input')?.value || '';
  renderNotebookUI(searchVal, { preserveLimit: true });
};

function appendNotebookPaginationButton(container, renderedCount, totalQuestions) {
  if (!container || renderedCount >= totalQuestions) return;
  const remaining = totalQuestions - renderedCount;
  const nextCount = Math.min(NOTEBOOK_PAGE_SIZE, remaining);

  const wrap = document.createElement('div');
  wrap.className = 'notebook-pagination-wrap';
  wrap.innerHTML = `
    <button type="button" class="btn-notebook-load-more" onclick="window.loadMoreNotebookNotes()">
      <i data-lucide="chevron-down" style="width:15px;height:15px;"></i>
      <span>Charger les ${nextCount} fiche${nextCount > 1 ? 's' : ''} suivante${nextCount > 1 ? 's' : ''} (${renderedCount}/${totalQuestions} affichées)</span>
    </button>
  `;
  container.appendChild(wrap);
}

export function renderNotebookUI(filterText = '', options = {}) {
  if (!options || !options.preserveLimit) {
    notebookVisibleLimit = NOTEBOOK_PAGE_SIZE;
  }

  const container = document.getElementById('notebook-notes-list');
  if (!container) return;

  const allNotes = queueEngine.getReasoningNotes();
  const activeModId = getActiveModuleId();
  const defaultChapter = resolveDefaultChapterForModule();

  const getNoteChap = (n) => {
    if (n.chapterTitle) return n.chapterTitle;
    if (n.questionUid && n.questionUid.startsWith('psy_') && activeModId !== 'psychiatrie') {
      return resolveAiModuleContext({ uid: n.questionUid }).defaultChapter;
    }
    return defaultChapter;
  };

  const chapFilterSelect = document.getElementById('notebook-chapter-filter');
  if (chapFilterSelect) {
    const countsByChapter = new Map();
    allNotes.forEach(n => {
      const ch = getNoteChap(n);
      countsByChapter.set(ch, (countsByChapter.get(ch) || 0) + 1);
    });
    const existingChapters = Array.from(countsByChapter.keys()).sort((a, b) => a.localeCompare(b, 'fr'));
    const currentVal = notebookSelectedChapter;
    let optionsHtml = `<option value="">Tous les cours (${allNotes.length} notes)</option>`;
    existingChapters.forEach(c => {
      optionsHtml += `<option value="${escapeHtml(c)}" ${c === currentVal ? 'selected' : ''}>${escapeHtml(c)} (${countsByChapter.get(c)})</option>`;
    });
    chapFilterSelect.innerHTML = optionsHtml;
  }

  const sortSelect = document.getElementById('notebook-sort-by');
  if (sortSelect && sortSelect.value !== notebookSortBy) {
    sortSelect.value = notebookSortBy;
  }
  updateSortOrderButtonUI();

  const filtered = allNotes.filter(n => {
    const noteChap = getNoteChap(n);
    if (notebookSelectedChapter && noteChap !== notebookSelectedChapter) {
      return false;
    }
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    const fullQ = findQuestionAcrossDatasets(n.questionUid);
    const optionsText = fullQ && fullQ.options ? fullQ.options.map(o => o.text).join(' ').toLowerCase() : '';
    const explanationText = (fullQ && fullQ.explanation ? fullQ.explanation.toLowerCase() : '') || (n.officialExplanation ? n.officialExplanation.toLowerCase() : '');
    const qText = (fullQ && fullQ.question ? fullQ.question.toLowerCase() : '') || (n.questionText ? n.questionText.toLowerCase() : '');
    const chapText = (fullQ && fullQ.chapterTitle ? fullQ.chapterTitle.toLowerCase() : '') || (n.chapterTitle ? n.chapterTitle.toLowerCase() : '');

    return qText.includes(q) ||
      chapText.includes(q) ||
      (n.reasoningNote && n.reasoningNote.toLowerCase().includes(q)) ||
      (n.userAnswer && n.userAnswer.toLowerCase().includes(q)) ||
      optionsText.includes(q) ||
      explanationText.includes(q);
  });

  const views = getDomViews();
  const summaryBar = document.getElementById('notebook-summary-bar');
  if (filtered.length === 0) {
    if (summaryBar) summaryBar.style.display = 'none';
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text-dim);">
        <i data-lucide="book-marked" style="width:36px;height:36px;margin:0 auto 10px;display:block;"></i>
        ${filterText || notebookSelectedChapter
          ? 'Aucune note ne correspond à vos filtres actuels.'
          : 'Aucune note de raisonnement pour le moment. Vos futures erreurs seront automatiquement analysées et regroupées ici par cours !'}
      </div>
    `;
    refreshLucide(views.notebook);
    return;
  }

  const groupedChapters = groupNotesByChapterAndQuestion(filtered);
  const totalQuestions = groupedChapters.reduce((sum, g) => sum + g.totalQuestions, 0);
  const totalNotes = groupedChapters.reduce((sum, g) => sum + g.totalNotes, 0);

  if (summaryBar) {
    summaryBar.style.display = 'flex';
    summaryBar.innerHTML = `
      <span class="notebook-stat-summary">
        <strong>${totalQuestions}</strong> question${totalQuestions > 1 ? 's' : ''} (${totalNotes} analyse${totalNotes > 1 ? 's' : ''}) • Tri : <strong class="text-cyan">${getSortSummaryLabel()}</strong>
      </span>
      <button class="notebook-toggle-all-btn" onclick="window.toggleAllChapters()" title="Tout replier ou tout déplier">
        <i data-lucide="chevrons-up-down" style="width:14px;height:14px;"></i>
        <span id="btn-toggle-all-chapters-text">Tout replier</span>
      </button>
    `;
  }

  container.innerHTML = '';
  let renderedQuestionsCount = 0;

  if (notebookViewMode === 'flat') {
    const allFlatQuestions = [];
    groupedChapters.forEach(g => {
      allFlatQuestions.push(...g.questions);
    });
    allFlatQuestions.sort((a, b) => compareQuestions(a, b, notebookSortBy, notebookSortOrder));

    const visibleFlat = allFlatQuestions.slice(0, notebookVisibleLimit);
    visibleFlat.forEach((q, qIdx) => {
      const cardHtml = renderQuestionCard(q, 'flat', qIdx, qIdx + 1);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = cardHtml;
      if (tempDiv.firstElementChild) container.appendChild(tempDiv.firstElementChild);
    });
    renderedQuestionsCount = visibleFlat.length;
  } else {
    let remainingBudget = notebookVisibleLimit;

    for (let gIdx = 0; gIdx < groupedChapters.length; gIdx++) {
      if (remainingBudget <= 0) break;

      const g = groupedChapters[gIdx];
      const visibleChapQuestions = g.questions.slice(0, remainingBudget);
      remainingBudget -= visibleChapQuestions.length;
      renderedQuestionsCount += visibleChapQuestions.length;

      const chapterGroupId = `chap_group_${gIdx}`;
      const chapterGroupEl = document.createElement('div');
      chapterGroupEl.className = 'notebook-chapter-group';
      chapterGroupEl.id = chapterGroupId;

      let questionsHtml = '';
      visibleChapQuestions.forEach((q, qIdx) => {
        questionsHtml += renderQuestionCard(q, gIdx, qIdx, null);
      });

      const mistakesCountBadge = g.chapterTotalMistakes > 0 ? `
        <span class="chapter-count-badge" style="background:rgba(239, 68, 68, 0.2);color:#fca5a5;border-color:rgba(239,68,68,0.4);" title="Total des fautes dans ce cours">
          ⚠️ ${g.chapterTotalMistakes} faute${g.chapterTotalMistakes > 1 ? 's' : ''}
        </span>
      ` : '';

      const partialLabel = visibleChapQuestions.length < g.totalQuestions
        ? `${visibleChapQuestions.length}/${g.totalQuestions}`
        : `${g.totalQuestions}`;

      chapterGroupEl.innerHTML = `
        <div class="notebook-chapter-header" onclick="window.toggleChapterGroup('${chapterGroupId}')">
          <div class="notebook-chapter-title-wrap">
            <i data-lucide="folder-open" class="chapter-folder-icon"></i>
            <span class="notebook-chapter-title">${escapeHtml(g.chapterTitle)}</span>
            <span class="chapter-count-badge">${partialLabel} question${g.totalQuestions > 1 ? 's' : ''}</span>
            <span class="chapter-count-badge" style="background:rgba(0, 212, 255, 0.15);color:var(--cyan);border-color:rgba(0,212,255,0.35);">
              ${g.totalNotes} analyse${g.totalNotes > 1 ? 's' : ''} IA
            </span>
            ${mistakesCountBadge}
          </div>
          <i data-lucide="chevron-down" class="chapter-chevron"></i>
        </div>
        <div class="notebook-chapter-body notebook-chapter-questions">
          ${questionsHtml}
        </div>
      `;

      container.appendChild(chapterGroupEl);
    }
  }

  appendNotebookPaginationButton(container, renderedQuestionsCount, totalQuestions);
  refreshLucide(views.notebook);
}

// ============================================================================
// CHAPTER SELECTION MODAL
// ============================================================================
export function openChaptersModal() {
  const container = document.getElementById('chapters-checkboxes-container');
  const modals = getDomModals();
  if (!container || !modals.chapters) return;
  container.innerHTML = '';

  const selectedSet = new Set(queueEngine.selectedChapterIds);

  appState.allChapters.forEach(chap => {
    const item = document.createElement('div');
    const isChecked = selectedSet.has(chap.id);
    item.className = `chapter-select-item ${isChecked ? 'checked' : ''}`;
    item.dataset.chapId = chap.id;

    item.innerHTML = `
      <div class="chapter-checkbox-wrap">
        <input type="checkbox" ${isChecked ? 'checked' : ''} style="accent-color:var(--cyan);width:16px;height:16px;">
        <span style="font-size:0.88rem;font-weight:600;">${escapeHtml(chap.title)}</span>
      </div>
      <span class="chapter-item-count">${chap.count} QCM</span>
    `;

    const checkbox = item.querySelector('input');
    item.onclick = (e) => {
      if (e.target !== checkbox) checkbox.checked = !checkbox.checked;
      item.classList.toggle('checked', checkbox.checked);
    };

    container.appendChild(item);
  });

  modals.chapters.style.display = 'flex';
  refreshLucide(modals.chapters);
}

export function applyChapterSelection() {
  const selected = [];
  document.querySelectorAll('.chapter-select-item').forEach(item => {
    const checkbox = item.querySelector('input');
    if (checkbox && checkbox.checked) {
      selected.push(item.dataset.chapId);
    }
  });

  queueEngine.selectedChaptersUpdatedAt = Date.now();
  queueEngine.initSession(selected);
  const modals = getDomModals();
  if (modals.chapters) modals.chapters.style.display = 'none';
  updateDashboardUI();
  appState.firebaseSyncService?.triggerAutoPush();
}
