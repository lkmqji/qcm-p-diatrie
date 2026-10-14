// PédiaDrill - Application Controller & Orchestration
import { geminiService } from './services/gemini.js';
import { QueueEngine } from './services/queueEngine.js';
import { FirebaseSyncService } from './services/firebaseSyncService.js';

// Global Data Access
const allQuestions = window.PEDIA_QUESTIONS || [];
const allChapters = window.PEDIA_CHAPTERS || [];

// Services
const queueEngine = new QueueEngine(allQuestions, allChapters);
const firebaseSyncService = new FirebaseSyncService(
  queueEngine,
  (status, detail, user, lastSyncText) => {
    updateGoogleAccountUI(status, detail, user, lastSyncText);
  },
  (mergedState) => {
    // Whenever Firestore data is received and merged
    updateDashboardUI();
    if (currentView === 'notebook') renderNotebookUI();
    updateArenaDailyBadge();
    updateModalLocalSummary();
    refreshLucide();
  }
);

// Local State
let currentQuestion = null;
let selectedOptionIds = new Set();
let isEvaluating = false;
let currentView = 'dashboard'; // 'dashboard' | 'arena' | 'notebook'

// DOM Elements
const views = {
  dashboard: document.getElementById('view-dashboard'),
  arena: document.getElementById('view-arena'),
  notebook: document.getElementById('view-notebook')
};

const modals = {
  error: document.getElementById('modal-error'),
  chapters: document.getElementById('modal-chapters'),
  sync: document.getElementById('modal-sync'),
  settings: document.getElementById('modal-settings')
};

// ============================================================================
// INITIALIZATION
// ============================================================================
function initApp() {
  queueEngine.setQuestions(allQuestions, allChapters);
  updateDashboardUI();
  setupEventListeners();
  setupKeyboardShortcuts();
  setupFirebaseService();
  refreshLucide();

  // Register Service Worker for offline PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('SW registration:', err);
    });
  }
}

function updateModalLocalSummary() {
  const summaryEl = document.getElementById('sync-local-summary');
  if (!summaryEl) return;
  const metrics = queueEngine.getDashboardMetrics();
  const notesCount = queueEngine.getReasoningNotes().length;
  summaryEl.textContent = `${metrics.masteredCount} maîtrisées • ${notesCount} note${notesCount > 1 ? 's' : ''} IA`;
}

function updateGoogleAccountUI(status, detail, user, lastSyncText) {
  const btnHeaderLogin = document.getElementById('btn-header-google-login');
  const badgeUserProfile = document.getElementById('btn-open-user-profile');
  const headerAvatar = document.getElementById('header-user-avatar');
  const headerName = document.getElementById('header-user-name');

  const cardDisconnected = document.getElementById('google-disconnected-card');
  const cardConnected = document.getElementById('google-connected-card');
  const modalAvatar = document.getElementById('modal-user-avatar');
  const modalName = document.getElementById('modal-user-name');
  const modalEmail = document.getElementById('modal-user-email');

  const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2310b981'><circle cx='12' cy='8' r='4'/><path d='M20 21a8 8 0 0 0-16 0'/></svg>";

  if (user) {
    if (btnHeaderLogin) btnHeaderLogin.style.display = 'none';
    if (badgeUserProfile) badgeUserProfile.style.display = 'inline-flex';

    const avatarUrl = user.photoURL || defaultAvatar;
    const firstName = user.displayName ? user.displayName.split(' ')[0] : (user.email ? user.email.split('@')[0] : 'Google');

    if (headerAvatar) headerAvatar.src = avatarUrl;
    if (headerName) headerName.textContent = firstName;

    if (cardDisconnected) cardDisconnected.style.display = 'none';
    if (cardConnected) cardConnected.style.display = 'flex';
    if (modalAvatar) modalAvatar.src = avatarUrl;
    if (modalName) modalName.textContent = user.displayName || 'Utilisateur Google';
    if (modalEmail) modalEmail.textContent = user.email || '';
  } else {
    if (btnHeaderLogin) btnHeaderLogin.style.display = 'inline-flex';
    if (badgeUserProfile) badgeUserProfile.style.display = 'none';

    if (cardDisconnected) cardDisconnected.style.display = 'flex';
    if (cardConnected) cardConnected.style.display = 'none';
  }

  const modalStatus = document.getElementById('sync-status-msg');
  if (modalStatus) {
    const accountTag = user ? `[${user.email || 'Google'}]` : '[Non connecté]';
    modalStatus.textContent = detail ? `${lastSyncText} • ${accountTag} (${detail})` : `${lastSyncText} • ${accountTag}`;
  }

  updateModalLocalSummary();
  refreshLucide();
}

function setupFirebaseService() {
  firebaseSyncService.init();

  // Populate form fields with saved config
  const cfg = firebaseSyncService.getSavedConfig();
  if (cfg) {
    const keyEl = document.getElementById('fb-api-key');
    const projEl = document.getElementById('fb-project-id');
    const authEl = document.getElementById('fb-auth-domain');
    const appEl = document.getElementById('fb-app-id');
    if (keyEl && cfg.apiKey) keyEl.value = cfg.apiKey;
    if (projEl && cfg.projectId) projEl.value = cfg.projectId;
    if (authEl && cfg.authDomain) authEl.value = cfg.authDomain;
    if (appEl && cfg.appId) appEl.value = cfg.appId;
  }
}

function refreshLucide() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// ============================================================================
// VIEW NAVIGATION
// ============================================================================
function switchView(viewName) {
  currentView = viewName;
  Object.keys(views).forEach(v => {
    if (views[v]) {
      views[v].style.display = (v === viewName) ? 'flex' : 'none';
    }
  });

  if (viewName === 'dashboard') {
    updateDashboardUI();
  } else if (viewName === 'arena') {
    loadNextArenaQuestion();
  } else if (viewName === 'notebook') {
    renderNotebookUI();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  refreshLucide();
}

// ============================================================================
// EXAM COUNTDOWN & DAILY CADENCE CALCULATOR (Examen le 10/11/2026)
// ============================================================================
function getExamCountdownMetrics(totalIterationsRequired) {
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const examDate = new Date(2026, 10, 10); // 10 Novembre 2026 (Mois 10 = Novembre)

  const diffMs = examDate.getTime() - todayMidnight.getTime();
  const daysLeft = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const dailyIterationsRequired = Math.ceil(Math.max(0, totalIterationsRequired) / daysLeft);

  return {
    examDateStr: '10/11',
    daysLeft,
    dailyIterationsRequired
  };
}

function updateArenaDailyBadge() {
  const dailyBadge = document.getElementById('arena-daily-pill');
  if (!dailyBadge) return;
  const metrics = queueEngine.getDashboardMetrics();
  const countdown = getExamCountdownMetrics(metrics.totalIterationsRequired);
  const todayTracker = queueEngine.getTodayTracker();
  dailyBadge.innerHTML = `<i data-lucide="target" style="width:12px;height:12px;display:inline;"></i> <span>${todayTracker.count}/${countdown.dailyIterationsRequired} auj. (J-${countdown.daysLeft})</span>`;
  refreshLucide();
}

// ============================================================================
// DASHBOARD RENDERING
// ============================================================================
function updateDashboardUI() {
  const metrics = queueEngine.getDashboardMetrics();
  const countdown = getExamCountdownMetrics(metrics.totalIterationsRequired);

  document.getElementById('stat-remaining-questions').textContent = formatNumber(metrics.remainingDistinctQuestions);
  document.getElementById('stat-required-iterations').textContent = formatNumber(metrics.totalIterationsRequired);
  document.getElementById('stat-mastered-count').textContent = formatNumber(metrics.masteredCount);
  document.getElementById('stat-mistakes-count').textContent = formatNumber(metrics.totalMistakes);
  document.getElementById('stat-progress-pct').textContent = `${metrics.progressPct}%`;
  
  // Daily Target & Exam Countdown
  const badgeCountdown = document.getElementById('badge-exam-countdown');
  if (badgeCountdown) {
    badgeCountdown.textContent = `⏳ J-${countdown.daysLeft} • Examen 10/11`;
  }

  const dailyTargetEl = document.getElementById('stat-daily-target');
  if (dailyTargetEl) {
    dailyTargetEl.textContent = formatNumber(countdown.dailyIterationsRequired);
  }

  const todayTracker = queueEngine.getTodayTracker();
  const todayDoneEl = document.getElementById('stat-today-done');
  if (todayDoneEl) {
    todayDoneEl.textContent = formatNumber(todayTracker.count);
  }

  const todayGoalEl = document.getElementById('stat-today-goal');
  if (todayGoalEl) {
    todayGoalEl.textContent = `${formatNumber(countdown.dailyIterationsRequired)} requises`;
  }

  const todayPctEl = document.getElementById('stat-today-pct');
  const todayFillEl = document.getElementById('daily-progress-fill');
  const pct = countdown.dailyIterationsRequired > 0 
    ? Math.min(100, Math.round((todayTracker.count / countdown.dailyIterationsRequired) * 100))
    : 100;

  if (todayPctEl) todayPctEl.textContent = `${pct}%`;
  if (todayFillEl) todayFillEl.style.width = `${pct}%`;

  const poolInfoEl = document.getElementById('badge-pool-info');
  if (poolInfoEl) poolInfoEl.textContent = `Sur ${formatNumber(metrics.totalPoolCount)}`;

  // Chapters label
  const chaptersBtnLabel = document.getElementById('btn-chapters-label');
  if (metrics.selectedChaptersCount === 0 || metrics.selectedChaptersCount === allChapters.length) {
    chaptersBtnLabel.textContent = `Tous les cours (${allChapters.length})`;
  } else {
    chaptersBtnLabel.textContent = `${metrics.selectedChaptersCount} cours sélectionnés (${metrics.queueLength} QCM en file)`;
  }

  // Notebook badge
  const notesCount = queueEngine.getReasoningNotes().length;
  document.getElementById('notebook-count-badge').textContent = notesCount;
}

function formatNumber(num) {
  return new Intl.NumberFormat('fr-FR').format(num || 0);
}

// ============================================================================
// FORMATTING HELPERS (CROQ, QCM & CLINICAL AI REASONING)
// ============================================================================
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseMarkdownInline(text) {
  if (!text) return '';
  let res = escapeHtml(text);
  // Bold + Italic ***...***
  res = res.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold **...**
  res = res.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic *...*
  res = res.replace(/(^|[^*])\*(?!\*)(.*?)(?<!\*)\*([^*]|$)/g, '$1<em>$2</em>$3');
  return res;
}

function formatReasoningNote(noteText) {
  if (!noteText || typeof noteText !== 'string' || !noteText.trim()) {
    return '<div class="reasoning-cards-container"><div class="reasoning-card card-method"><div class="reasoning-card-body">Aucune note de raisonnement clinique disponible.</div></div></div>';
  }

  const raw = noteText.trim();

  // Flexible section extractors (supporting 1. 🎯, 🎯, ### 🎯, PIÈGE, RÉGLE, RÈGLE, REGLE etc.)
  const trapRegex = /(?:###\s*|\*\*|#\s*)?(?:1[\.\)]\s*)?🎯\s*PI[ÈÉEeèéê]GE[^\n:]*[:\n]([\s\S]*?)(?=(?:###\s*|\*\*|#\s*)?(?:2[\.\)]\s*)?🩺\s*M[ÉEèéê]THODE|$)/i;
  const methodRegex = /(?:###\s*|\*\*|#\s*)?(?:2[\.\)]\s*)?🩺\s*M[ÉEèéê]THODE[^\n:]*[:\n]([\s\S]*?)(?=(?:###\s*|\*\*|#\s*)?(?:3[\.\)]\s*)?💡\s*R[ÈÉEeèéê]GLE|$)/i;
  const ruleRegex = /(?:###\s*|\*\*|#\s*)?(?:3[\.\)]\s*)?💡\s*R[ÈÉEeèéê]GLE[^\n:]*[:\n]([\s\S]*?)$/i;

  const trapMatch = raw.match(trapRegex);
  const methodMatch = raw.match(methodRegex);
  const ruleMatch = raw.match(ruleRegex);

  const renderSectionContent = (contentRaw) => {
    if (!contentRaw) return '';
    let clean = contentRaw.trim().replace(/^\*\*|\*\*$/g, '').trim();
    const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
    let out = '';
    let inList = false;

    lines.forEach(line => {
      if (/^[-•*]\s+/.test(line)) {
        if (!inList) {
          out += '<ul class="reasoning-list">';
          inList = true;
        }
        const bulletText = line.replace(/^[-•*]\s+/, '');
        out += `<li class="reasoning-list-item">${parseMarkdownInline(bulletText)}</li>`;
      } else {
        if (inList) {
          out += '</ul>';
          inList = false;
        }
        out += `<p class="reasoning-paragraph">${parseMarkdownInline(line)}</p>`;
      }
    });
    if (inList) out += '</ul>';
    return out;
  };

  if (trapMatch || methodMatch || ruleMatch) {
    let html = '<div class="reasoning-cards-container">';

    if (trapMatch && trapMatch[1] && trapMatch[1].trim()) {
      html += `
        <div class="reasoning-card card-trap">
          <div class="reasoning-card-header">
            <span class="reasoning-badge badge-trap">
              <span class="badge-icon">🎯</span>
              <span>Piège & Distracteur</span>
            </span>
          </div>
          <div class="reasoning-card-body">${renderSectionContent(trapMatch[1])}</div>
        </div>`;
    }

    if (methodMatch && methodMatch[1] && methodMatch[1].trim()) {
      html += `
        <div class="reasoning-card card-method">
          <div class="reasoning-card-header">
            <span class="reasoning-badge badge-method">
              <span class="badge-icon">🩺</span>
              <span>Méthode de Raisonnement</span>
            </span>
          </div>
          <div class="reasoning-card-body">${renderSectionContent(methodMatch[1])}</div>
        </div>`;
    }

    if (ruleMatch && ruleMatch[1] && ruleMatch[1].trim()) {
      html += `
        <div class="reasoning-card card-rule">
          <div class="reasoning-card-header">
            <span class="reasoning-badge badge-rule">
              <span class="badge-icon">💡</span>
              <span>Règle d'Or & Mémo Concours</span>
            </span>
          </div>
          <div class="reasoning-card-body">${renderSectionContent(ruleMatch[1])}</div>
        </div>`;
    }

    html += '</div>';
    return html;
  }

  // Fallback for unstructured notes: render clean paragraphs & lists
  return `<div class="reasoning-cards-container"><div class="reasoning-card card-method"><div class="reasoning-card-body">${renderSectionContent(raw)}</div></div></div>`;
}

function formatCroqAnswer(answerText) {
  if (!answerText || typeof answerText !== 'string' || !answerText.trim()) {
    return '<div class="empty-answer">Non renseignée</div>';
  }

  const trimmed = answerText.trim();

  // Pattern detection: dashed items (e.g. "Intro : - Item 1 - Item 2") or numbered items
  const hasDashes = /(?:^|\s|\.)-\s*[A-ZÀ-ÖØ-öø-ÿ0-9]/.test(trimmed) || trimmed.startsWith('-');
  const hasNumberedPoints = /(?:^|\n|\s)\d+[\.\)]\s+/.test(trimmed);

  if (hasDashes) {
    const firstDashMatch = trimmed.match(/(?:^|\s|\.)-\s*([A-ZÀ-ÖØ-öø-ÿ0-9])/i);
    let intro = '';
    let itemsRaw = trimmed;

    if (firstDashMatch && firstDashMatch.index > 0) {
      intro = trimmed.slice(0, firstDashMatch.index).trim();
      intro = intro.replace(/[:\-]$/, '').trim();
      itemsRaw = trimmed.slice(firstDashMatch.index);
    }

    const points = itemsRaw
      .split(/(?:^|\s|\.)-\s*/)
      .map(p => p.trim())
      .filter(p => p.length > 0 && p !== '-');

    let html = '<div class="croq-structured-answer">';
    if (intro) {
      html += `<div class="croq-intro">${parseMarkdownInline(intro)} :</div>`;
    }
    if (points.length > 0) {
      html += '<ul class="croq-points-list">';
      points.forEach(point => {
        const cleanPt = point.replace(/^-\s*/, '').replace(/\s*\.\s*$/, '');
        if (cleanPt) {
          html += `<li class="croq-point-item"><span class="croq-point-check">✓</span><span class="croq-point-text">${parseMarkdownInline(cleanPt)}</span></li>`;
        }
      });
      html += '</ul>';
    }
    html += '</div>';
    return html;
  }

  if (hasNumberedPoints) {
    const points = trimmed.split(/(?:^|\n|\s)\d+[\.\)]\s+/).map(p => p.trim()).filter(Boolean);
    let html = '<div class="croq-structured-answer"><ul class="croq-points-list">';
    points.forEach((point, idx) => {
      html += `<li class="croq-point-item"><span class="croq-point-number">${idx + 1}</span><span class="croq-point-text">${parseMarkdownInline(point)}</span></li>`;
    });
    html += '</ul></div>';
    return html;
  }

  return `<div class="croq-simple-answer">${parseMarkdownInline(trimmed)}</div>`;
}

function formatAnswerComparison(userAnswer, correctAnswer, isCroq = false, score = null) {
  let userHtml = '';
  let correctHtml = '';

  if (isCroq) {
    const scoreBadge = (score !== null && score !== undefined)
      ? `<span class="answer-badge ${score >= 75 ? 'badge-success' : 'badge-failure'}">Score : ${score}%</span>`
      : '';

    userHtml = `
      <div class="answer-box box-user">
        <div class="answer-box-header">
          <span class="answer-box-title text-rose">
            <span class="box-icon">✕</span> Votre proposition :
          </span>
          ${scoreBadge}
        </div>
        <div class="answer-box-content croq-user-text">
          ${userAnswer ? parseMarkdownInline(userAnswer) : '<em>Aucune réponse saisie</em>'}
        </div>
      </div>
    `;

    correctHtml = `
      <div class="answer-box box-correct">
        <div class="answer-box-header">
          <span class="answer-box-title text-emerald">
            <span class="box-icon">✓</span> Réponse type officielle :
          </span>
          <span class="answer-badge badge-official">Référence concours</span>
        </div>
        <div class="answer-box-content">
          ${formatCroqAnswer(correctAnswer)}
        </div>
      </div>
    `;
  } else {
    userHtml = `
      <div class="answer-box box-user">
        <div class="answer-box-header">
          <span class="answer-box-title text-rose">
            <span class="box-icon">✕</span> Votre choix :
          </span>
        </div>
        <div class="answer-box-content qcm-choice-text">
          <strong>${userAnswer ? parseMarkdownInline(userAnswer) : 'Aucun'}</strong>
        </div>
      </div>
    `;

    correctHtml = `
      <div class="answer-box box-correct">
        <div class="answer-box-header">
          <span class="answer-box-title text-emerald">
            <span class="box-icon">✓</span> Bonne(s) réponse(s) :
          </span>
        </div>
        <div class="answer-box-content qcm-choice-text">
          <strong>${parseMarkdownInline(correctAnswer)}</strong>
        </div>
      </div>
    `;
  }

  return `
    <div class="answer-comparison-grid">
      ${userHtml}
      ${correctHtml}
    </div>
  `;
}

// ============================================================================
// QUIZ ARENA (QUESTION DISPLAY & SUBMISSION)
// ============================================================================
function loadNextArenaQuestion() {
  currentQuestion = queueEngine.getCurrentQuestion();
  selectedOptionIds.clear();
  isEvaluating = false;

  // Hide success banner, show default actions
  document.getElementById('arena-success-banner').style.display = 'none';
  document.getElementById('arena-default-actions').style.display = 'flex';

  if (!currentQuestion) {
    // All questions cleaned!
    showVictoryScreen();
    return;
  }

  const stats = queueEngine.getQuestionStats(currentQuestion.uid);

  // Chapter & type badges
  document.getElementById('arena-chapter-title').textContent = `Pédiatrie — ${currentQuestion.chapterTitle || 'Général'}`;
  
  const typePill = document.getElementById('arena-type-pill');
  typePill.textContent = currentQuestion.type;
  typePill.className = `tag-pill tag-${currentQuestion.type.toLowerCase()}`;

  // Progress badge
  const progressPill = document.getElementById('arena-progress-pill');
  if (stats.mistakes > 0) {
    progressPill.textContent = `⚠️ ${stats.current}/${stats.target} (${stats.mistakes} faute${stats.mistakes > 1 ? 's' : ''})`;
    progressPill.className = 'tag-pill progress-penalized';
  } else {
    progressPill.textContent = `✅ ${stats.current}/${stats.target} pour éliminer`;
    progressPill.className = 'tag-pill progress-pill';
  }

  updateArenaDailyBadge();

  // Clinical Case
  const clinicalBox = document.getElementById('arena-clinical-case');
  const clinicalText = document.getElementById('arena-clinical-case-text');
  if (currentQuestion.clinical_case && currentQuestion.clinical_case.trim()) {
    clinicalText.textContent = currentQuestion.clinical_case.trim();
    clinicalBox.style.display = 'block';
  } else {
    clinicalBox.style.display = 'none';
  }

  // Question Statement
  document.getElementById('arena-question-text').textContent = currentQuestion.question || currentQuestion.statement;

  // Media preview
  const mediaWrap = document.getElementById('arena-media-wrap');
  mediaWrap.innerHTML = '';
  if (currentQuestion.media_urls && currentQuestion.media_urls.length > 0) {
    currentQuestion.media_urls.forEach(url => {
      const img = document.createElement('img');
      img.src = url;
      img.className = 'media-thumbnail';
      img.title = 'Cliquer pour agrandir';
      img.onclick = () => window.open(url, '_blank');
      mediaWrap.appendChild(img);
    });
    mediaWrap.style.display = 'flex';
  } else {
    mediaWrap.style.display = 'none';
  }

  // Options vs CROQ rendering
  const optionsContainer = document.getElementById('arena-options-container');
  const croqContainer = document.getElementById('arena-croq-container');
  const btnSubmitAnswer = document.getElementById('btn-submit-answer');
  const btnSubmitCroq = document.getElementById('btn-submit-croq');
  const shortcutHint = document.getElementById('keyboard-shortcuts-hint');

  if (currentQuestion.is_croq) {
    // Mode CROQ
    optionsContainer.style.display = 'none';
    croqContainer.style.display = 'flex';
    document.getElementById('arena-croq-input').value = '';
    btnSubmitAnswer.style.display = 'none';
    btnSubmitCroq.style.display = 'flex';
    shortcutHint.textContent = 'Mode CROQ : Évaluation IA sémantique';
  } else {
    // Mode QCU / QCM
    croqContainer.style.display = 'none';
    optionsContainer.style.display = 'flex';
    btnSubmitAnswer.style.display = 'flex';
    btnSubmitCroq.style.display = 'none';
    btnSubmitAnswer.disabled = true;
    shortcutHint.textContent = 'Raccourcis : [1-5] pour cocher, [Entrée] pour valider';

    renderOptionsList(currentQuestion.options || [], currentQuestion.type === 'QCM');
  }

  refreshLucide();
}

function renderOptionsList(options, isMultiChoice) {
  const container = document.getElementById('arena-options-container');
  container.innerHTML = '';

  options.forEach((opt, idx) => {
    const item = document.createElement('div');
    item.className = 'option-item';
    item.dataset.optId = opt.id || idx;
    item.dataset.letter = opt.letter || String.fromCharCode(65 + idx);

    item.innerHTML = `
      <div class="option-letter">${item.dataset.letter}</div>
      <div class="option-text">${opt.text}</div>
    `;

    item.addEventListener('click', () => {
      toggleOptionSelection(item, isMultiChoice);
    });

    container.appendChild(item);
  });
}

function toggleOptionSelection(itemElement, isMultiChoice) {
  const optId = itemElement.dataset.optId;

  if (isMultiChoice) {
    if (selectedOptionIds.has(optId)) {
      selectedOptionIds.delete(optId);
      itemElement.classList.remove('selected');
    } else {
      selectedOptionIds.add(optId);
      itemElement.classList.add('selected');
    }
  } else {
    // Single Choice (QCU)
    selectedOptionIds.clear();
    document.querySelectorAll('.option-item').forEach(el => el.classList.remove('selected'));
    selectedOptionIds.add(optId);
    itemElement.classList.add('selected');
  }

  const btnSubmit = document.getElementById('btn-submit-answer');
  btnSubmit.disabled = selectedOptionIds.size === 0;
}

// Keyboard quick selection
function selectOptionByIndex(index) {
  if (!currentQuestion || currentQuestion.is_croq) return;
  const options = document.querySelectorAll('.option-item');
  if (options[index]) {
    const isMulti = currentQuestion.type === 'QCM';
    toggleOptionSelection(options[index], isMulti);
  }
}

// ============================================================================
// ANSWER SUBMISSION (QCU / QCM)
// ============================================================================
async function handleSubmitQcm() {
  if (!currentQuestion || selectedOptionIds.size === 0 || isEvaluating) return;
  isEvaluating = true;

  const correctOptions = (currentQuestion.options || []).filter(o => o.is_correct);
  const correctLetters = correctOptions.map(o => o.letter).sort();

  const selectedLetters = [];
  document.querySelectorAll('.option-item.selected').forEach(el => {
    selectedLetters.push(el.dataset.letter);
  });
  selectedLetters.sort();

  // Strict match comparison
  const isCorrect = (correctLetters.length === selectedLetters.length) &&
    correctLetters.every((letter, idx) => letter === selectedLetters[idx]);

  if (isCorrect) {
    handleAnswerSuccess();
  } else {
    await handleAnswerFailure(selectedLetters, correctLetters.join(', '));
  }
}

// ============================================================================
// ANSWER SUBMISSION (CROQ via Gemini)
// ============================================================================
async function handleSubmitCroq() {
  if (!currentQuestion || !currentQuestion.is_croq || isEvaluating) return;
  const userInput = document.getElementById('arena-croq-input').value.trim();
  if (!userInput) {
    alert('Veuillez saisir votre réponse avant de lancer l\'évaluation.');
    return;
  }

  isEvaluating = true;
  const btn = document.getElementById('btn-submit-croq');
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader" class="spin"></i> <span>Évaluation par IA en cours...</span>`;
  refreshLucide();

  try {
    const evalResult = await geminiService.evaluateCroq(
      currentQuestion.question,
      currentQuestion.clinical_case,
      currentQuestion.croq_answer,
      userInput
    );

    if (evalResult.isValid && evalResult.score >= 75) {
      // Correct!
      handleAnswerSuccess(evalResult.score, evalResult.feedback);
    } else {
      // Failed!
      await handleAnswerFailure(
        [userInput], 
        currentQuestion.croq_answer, 
        true, 
        evalResult.score, 
        evalResult.feedback
      );
    }
  } catch (err) {
    console.error('CROQ error:', err);
    alert('Une erreur est survenue lors de l\'évaluation. Fallback activé.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="sparkles"></i> <span>Évaluer par IA (Gemini)</span>`;
    refreshLucide();
  }
}

// ============================================================================
// SUCCESS HANDLER
// ============================================================================
function handleAnswerSuccess(score = null, feedback = null) {
  const result = queueEngine.handleSuccess(currentQuestion.uid);
  queueEngine.incrementTodayCount();
  updateArenaDailyBadge();
  firebaseSyncService.triggerAutoPush();

  // Trigger celebration confetti
  if (result.permanentlyRemoved) {
    triggerMasteryConfetti();
  }

  // Update success banner
  document.getElementById('arena-default-actions').style.display = 'none';
  const banner = document.getElementById('arena-success-banner');
  const bannerText = document.getElementById('arena-success-text');

  if (result.permanentlyRemoved) {
    bannerText.innerHTML = `<strong>Éliminée pour de bon ! 🎉</strong> Cette question a été validée avec succès (${result.target}/${result.target}) et n'apparaîtra plus.`;
  } else {
    const scoreText = score ? ` (Score : ${score}%)` : '';
    bannerText.innerHTML = `<strong>Bonne réponse${scoreText} !</strong> Validée ${result.newCurrent}/${result.target} fois. Repoussée de ${result.pushDistance} cartes.`;
  }

  banner.style.display = 'flex';
  refreshLucide();
}

function triggerMasteryConfetti() {
  if (typeof window.confetti === 'function') {
    window.confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
  }
}

// ============================================================================
// FAILURE HANDLER & ERROR MODAL WITH AI REASONING
// ============================================================================
async function handleAnswerFailure(userAnswerLetters, correctAnswerText, isCroq = false, score = 0, feedback = '') {
  const result = queueEngine.handleFailure(currentQuestion.uid);
  queueEngine.incrementTodayCount();
  updateArenaDailyBadge();

  // Populate penalty header
  document.getElementById('error-modal-penalty-title').textContent = 
    `Pénalité appliquée : seuil augmenté à ${result.newTarget} réussites requises`;
  document.getElementById('error-modal-penalty-desc').textContent = 
    `Cette question a été ratée (${result.mistakes} faute${result.mistakes > 1 ? 's' : ''}). Elle réapparaîtra très vite (dans ${result.pushDistance} cartes) pour ancrer le bon réflexe.`;

  // Render structured comparison in error modal
  const userText = isCroq ? (userAnswerLetters[0] || '') : (userAnswerLetters.join(', ') || 'Aucune réponse cochée');
  const comparisonContainer = document.getElementById('error-modal-comparison-container') 
    || document.querySelector('.answer-recap-box');

  if (comparisonContainer) {
    comparisonContainer.outerHTML = `<div id="error-modal-comparison-container">${formatAnswerComparison(userText, correctAnswerText, isCroq, score)}</div>`;
  }

  // Show modal immediately
  modals.error.style.display = 'flex';
  const aiNoteContainer = document.getElementById('error-modal-ai-note');
  aiNoteContainer.innerHTML = `
    <div class="reasoning-loader-wrap">
      <i data-lucide="sparkles" class="spin"></i>
      <span>Consultation du professeur IA et formulation de la méthode clinique...</span>
    </div>
  `;
  refreshLucide();

  // Request AI reasoning note asynchronously
  const reasoningObj = await geminiService.generateReasoningNote(
    currentQuestion,
    userAnswerLetters,
    isCroq,
    userAnswerLetters[0] || ''
  );

  aiNoteContainer.innerHTML = formatReasoningNote(reasoningObj.note);
  document.getElementById('error-modal-model-tag').textContent = reasoningObj.modelUsed;

  // Save to Notebook with CROQ flag and score
  const noteRecord = {
    id: `note_${Date.now()}`,
    questionUid: currentQuestion.uid,
    questionText: currentQuestion.question,
    chapterTitle: currentQuestion.chapterTitle,
    userAnswer: userText,
    correctAnswer: correctAnswerText,
    isCroq: !!isCroq,
    score: isCroq ? score : null,
    reasoningNote: reasoningObj.note,
    modelUsed: reasoningObj.modelUsed,
    timestamp: Date.now()
  };
  queueEngine.saveReasoningNote(noteRecord);
  firebaseSyncService.triggerAutoPush();

  // Update notebook badge in dashboard
  const notesCount = queueEngine.getReasoningNotes().length;
  const badgeEl = document.getElementById('notebook-count-badge');
  if (badgeEl) badgeEl.textContent = notesCount;

  refreshLucide();
}

function closeErrorModalAndContinue() {
  modals.error.style.display = 'none';
  loadNextArenaQuestion();
}

// ============================================================================
// ALL CLEANED VICTORY SCREEN
// ============================================================================
function showVictoryScreen() {
  document.getElementById('arena-question-text').innerHTML = `
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
  document.getElementById('arena-options-container').innerHTML = '';
  document.getElementById('arena-croq-container').style.display = 'none';
  document.getElementById('arena-default-actions').style.display = 'none';

  document.getElementById('btn-victory-home').onclick = () => switchView('dashboard');
  triggerMasteryConfetti();
}

// ============================================================================
// CARNET DE RAISONNEMENT IA (Groupé par Cours & Question Unique)
// ============================================================================
let notebookSelectedChapter = '';

function groupNotesByChapterAndQuestion(notes) {
  const chapterMap = new Map();

  notes.forEach(note => {
    const chap = (note.chapterTitle && note.chapterTitle.trim()) || "Pédiatrie Générale";
    const qKey = note.questionUid || note.questionText || note.id;

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
  const sortedChapters = Array.from(chapterMap.keys()).sort((a, b) => a.localeCompare(b, 'fr'));

  for (const chapTitle of sortedChapters) {
    const qMap = chapterMap.get(chapTitle);
    const questions = [];

    for (const [qKey, attempts] of qMap.entries()) {
      // Sort attempts: newest first
      attempts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      const primary = attempts[0];
      const isCroq = primary.isCroq || (primary.correctAnswer && primary.correctAnswer.length > 50) || (primary.userAnswer && primary.userAnswer.length > 30);

      questions.push({
        questionKey: qKey,
        questionUid: primary.questionUid,
        questionText: primary.questionText,
        chapterTitle: chapTitle,
        isCroq: !!isCroq,
        attemptsCount: attempts.length,
        attempts: attempts
      });
    }

    result.push({
      chapterTitle: chapTitle,
      totalQuestions: questions.length,
      totalNotes: questions.reduce((sum, q) => sum + q.attemptsCount, 0),
      questions
    });
  }

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

window.toggleAllChapters = function() {
  const allGroups = document.querySelectorAll('.notebook-chapter-group');
  const hasExpanded = Array.from(allGroups).some(g => !g.classList.contains('collapsed'));
  allGroups.forEach(g => {
    if (hasExpanded) {
      g.classList.add('collapsed');
    } else {
      g.classList.remove('collapsed');
    }
  });
  const btnText = document.getElementById('btn-toggle-all-chapters-text');
  if (btnText) {
    btnText.textContent = hasExpanded ? 'Tout déplier' : 'Tout replier';
  }
};

function renderNotebookUI(filterText = '') {
  const container = document.getElementById('notebook-notes-list');
  const allNotes = queueEngine.getReasoningNotes();

  // Populate or update the chapter filter select if it exists
  const chapFilterSelect = document.getElementById('notebook-chapter-filter');
  if (chapFilterSelect) {
    const existingChapters = Array.from(new Set(allNotes.map(n => n.chapterTitle || 'Pédiatrie Générale'))).sort((a,b) => a.localeCompare(b, 'fr'));
    const currentVal = notebookSelectedChapter;
    let optionsHtml = `<option value="">Tous les cours (${allNotes.length} notes)</option>`;
    existingChapters.forEach(c => {
      const count = allNotes.filter(n => (n.chapterTitle || 'Pédiatrie Générale') === c).length;
      optionsHtml += `<option value="${escapeHtml(c)}" ${c === currentVal ? 'selected' : ''}>${escapeHtml(c)} (${count})</option>`;
    });
    chapFilterSelect.innerHTML = optionsHtml;
  }

  // Filter notes by text & chapter
  const filtered = allNotes.filter(n => {
    if (notebookSelectedChapter && (n.chapterTitle || 'Pédiatrie Générale') !== notebookSelectedChapter) {
      return false;
    }
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    return (n.questionText && n.questionText.toLowerCase().includes(q)) ||
           (n.chapterTitle && n.chapterTitle.toLowerCase().includes(q)) ||
           (n.reasoningNote && n.reasoningNote.toLowerCase().includes(q)) ||
           (n.userAnswer && n.userAnswer.toLowerCase().includes(q));
  });

  // Update summary bar
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
    refreshLucide();
    return;
  }

  const groupedChapters = groupNotesByChapterAndQuestion(filtered);
  const totalQuestions = groupedChapters.reduce((sum, g) => sum + g.totalQuestions, 0);
  const totalNotes = groupedChapters.reduce((sum, g) => sum + g.totalNotes, 0);

  if (summaryBar) {
    summaryBar.style.display = 'flex';
    summaryBar.innerHTML = `
      <span class="notebook-stat-summary">
        <strong>${totalQuestions}</strong> question${totalQuestions > 1 ? 's' : ''} regroupée${totalQuestions > 1 ? 's' : ''} (${totalNotes} analyse${totalNotes > 1 ? 's' : ''}) dans <strong>${groupedChapters.length}</strong> cours
      </span>
      <button class="notebook-toggle-all-btn" onclick="window.toggleAllChapters()">
        <i data-lucide="chevrons-up-down" style="width:14px;height:14px;"></i>
        <span id="btn-toggle-all-chapters-text">Tout replier</span>
      </button>
    `;
  }

  container.innerHTML = '';

  groupedChapters.forEach((g, gIdx) => {
    const chapterGroupId = `chap_group_${gIdx}`;
    const chapterGroupEl = document.createElement('div');
    chapterGroupEl.className = 'notebook-chapter-group';
    chapterGroupEl.id = chapterGroupId;

    let questionsHtml = '';
    g.questions.forEach((q, qIdx) => {
      const qDomId = `qcard_${gIdx}_${qIdx}`;
      const latestAttempt = q.attempts[0];
      const latestDateStr = latestAttempt.timestamp 
        ? new Date(latestAttempt.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
        : '';

      // Attempts tab switcher (if multiple attempts on the same question)
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

      // Pre-rendered panels for each attempt
      const panelsHtml = q.attempts.map((att, attIdx) => {
        const compHtml = formatAnswerComparison(att.userAnswer, att.correctAnswer, q.isCroq, att.score);
        const reasHtml = formatReasoningNote(att.reasoningNote);
        return `
          <div class="attempt-panel" id="${qDomId}_att_${attIdx}" style="${attIdx === 0 ? '' : 'display:none;'}">
            ${compHtml}
            ${reasHtml}
          </div>
        `;
      }).join('');

      questionsHtml += `
        <div class="note-card grouped-question-card" id="${qDomId}">
          <div class="note-card-header">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="note-chapter">${escapeHtml(q.chapterTitle)}</span>
              <span class="tag-pill ${q.isCroq ? 'tag-croq' : 'tag-qcu'}" style="font-size:0.68rem;padding:2px 8px;">
                ${q.isCroq ? 'CROQ' : 'QCM'}
              </span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              ${q.attemptsCount > 1 ? `
                <span class="attempts-history-badge">
                  <i data-lucide="history" style="width:13px;height:13px;"></i>
                  ${q.attemptsCount} tentatives regroupées
                </span>
              ` : ''}
              ${latestAttempt.modelUsed ? `<span style="font-size:0.7rem;color:var(--text-dim);font-weight:600;">${latestAttempt.modelUsed}</span>` : ''}
              <span class="note-date">${latestDateStr}</span>
            </div>
          </div>
          <div class="note-question">${parseMarkdownInline(q.questionText)}</div>
          ${switcherHtml}
          <div class="attempt-content-container">
            ${panelsHtml}
          </div>
        </div>
      `;
    });

    chapterGroupEl.innerHTML = `
      <div class="notebook-chapter-header" onclick="window.toggleChapterGroup('${chapterGroupId}')">
        <div class="notebook-chapter-title-wrap">
          <i data-lucide="book-open" class="notebook-chapter-icon"></i>
          <span class="notebook-chapter-title">${escapeHtml(g.chapterTitle)}</span>
        </div>
        <div class="notebook-chapter-badges">
          <span class="chapter-count-pill">${g.totalQuestions} question${g.totalQuestions > 1 ? 's' : ''}</span>
          ${g.totalNotes > g.totalQuestions ? `<span class="chapter-notes-pill">${g.totalNotes} analyses</span>` : ''}
          <i data-lucide="chevron-down" class="chapter-chevron"></i>
        </div>
      </div>
      <div class="notebook-chapter-questions">
        ${questionsHtml}
      </div>
    `;

    container.appendChild(chapterGroupEl);
  });

  refreshLucide();
}

// ============================================================================
// CHAPTER SELECTION MODAL
// ============================================================================
function openChaptersModal() {
  const container = document.getElementById('chapters-checkboxes-container');
  container.innerHTML = '';

  const selectedSet = new Set(queueEngine.selectedChapterIds);

  allChapters.forEach(chap => {
    const item = document.createElement('div');
    const isChecked = selectedSet.has(chap.id);
    item.className = `chapter-select-item ${isChecked ? 'checked' : ''}`;
    item.dataset.chapId = chap.id;

    item.innerHTML = `
      <div class="chapter-checkbox-wrap">
        <input type="checkbox" ${isChecked ? 'checked' : ''} style="accent-color:var(--cyan);width:16px;height:16px;">
        <span style="font-size:0.88rem;font-weight:600;">${chap.title}</span>
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
  refreshLucide();
}

function applyChapterSelection() {
  const selected = [];
  document.querySelectorAll('.chapter-select-item').forEach(item => {
    const checkbox = item.querySelector('input');
    if (checkbox && checkbox.checked) {
      selected.push(item.dataset.chapId);
    }
  });

  queueEngine.initSession(selected);
  modals.chapters.style.display = 'none';
  updateDashboardUI();
}

// ============================================================================
// EVENT LISTENERS & KEYBOARD BINDINGS
// ============================================================================
function setupEventListeners() {
  // Navigation
  document.getElementById('btn-home-logo').onclick = () => switchView('dashboard');
  document.getElementById('btn-leave-arena').onclick = () => switchView('dashboard');
  document.getElementById('btn-leave-notebook').onclick = () => switchView('dashboard');
  document.getElementById('btn-open-notebook').onclick = () => switchView('notebook');
  document.getElementById('btn-open-notebook-icon').onclick = () => switchView('notebook');

  // Dashboard primary buttons
  document.getElementById('btn-start-random').onclick = () => {
    // If no chapters selected or reset requested
    if (queueEngine.queue.length === 0) {
      queueEngine.initSession([]);
    }
    switchView('arena');
  };

  document.getElementById('btn-open-chapters').onclick = openChaptersModal;
  document.getElementById('btn-toggle-all-chapters').onclick = () => {
    const items = document.querySelectorAll('.chapter-select-item input');
    const shouldCheck = Array.from(items).some(i => !i.checked);
    items.forEach(i => {
      i.checked = shouldCheck;
      i.closest('.chapter-select-item').classList.toggle('checked', shouldCheck);
    });
  };
  document.getElementById('btn-apply-chapters').onclick = applyChapterSelection;
  document.getElementById('btn-close-chapters-modal').onclick = () => {
    modals.chapters.style.display = 'none';
  };

  // Arena Actions
  document.getElementById('btn-submit-answer').onclick = handleSubmitQcm;
  document.getElementById('btn-submit-croq').onclick = handleSubmitCroq;
  document.getElementById('btn-next-question').onclick = () => loadNextArenaQuestion();

  // Reset Session
  document.getElementById('btn-reset-session').onclick = () => {
    if (confirm('Voulez-vous réinitialiser votre progression sur cette sélection ?')) {
      queueEngine.resetSessionProgress();
      updateDashboardUI();
    }
  };

  // Error modal
  document.getElementById('btn-continue-after-error').onclick = closeErrorModalAndContinue;
  document.getElementById('btn-close-error-modal').onclick = closeErrorModalAndContinue;

  // Notebook search & chapter filter
  document.getElementById('notebook-search-input').oninput = (e) => {
    renderNotebookUI(e.target.value);
  };
  const notebookChapFilter = document.getElementById('notebook-chapter-filter');
  if (notebookChapFilter) {
    notebookChapFilter.onchange = (e) => {
      notebookSelectedChapter = e.target.value;
      const searchVal = document.getElementById('notebook-search-input')?.value || '';
      renderNotebookUI(searchVal);
    };
  }

  // Chapters modal search
  document.getElementById('chapters-search-input').oninput = (e) => {
    const filter = e.target.value.toLowerCase();
    document.querySelectorAll('.chapter-select-item').forEach(item => {
      const title = item.querySelector('span').textContent.toLowerCase();
      item.style.display = title.includes(filter) ? 'flex' : 'none';
    });
  };

  // Google Auth & Sync Modal Triggers
  const openSyncModal = () => {
    updateModalLocalSummary();
    const currentUser = firebaseSyncService.user;
    updateGoogleAccountUI(
      firebaseSyncService.status, 
      '', 
      currentUser, 
      currentUser ? firebaseSyncService.getLastSyncedText() : 'Non connecté'
    );
    modals.sync.style.display = 'flex';
  };

  const btnHeaderLogin = document.getElementById('btn-header-google-login');
  if (btnHeaderLogin) btnHeaderLogin.onclick = openSyncModal;

  const btnUserProfile = document.getElementById('btn-open-user-profile');
  if (btnUserProfile) btnUserProfile.onclick = openSyncModal;

  document.getElementById('btn-close-sync-modal').onclick = () => modals.sync.style.display = 'none';

  // Modal Google Login Button
  const btnModalGoogleLogin = document.getElementById('btn-modal-google-login');
  if (btnModalGoogleLogin) {
    btnModalGoogleLogin.onclick = async () => {
      if (!firebaseSyncService.hasConfig()) {
        const panel = document.getElementById('firebase-config-panel');
        if (panel) panel.style.display = 'flex';
        const chevron = document.getElementById('firebase-chevron');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
        alert('Veuillez renseigner les identifiants de votre projet Firebase dans le panneau ci-dessous pour connecter Google.');
        return;
      }

      btnModalGoogleLogin.disabled = true;
      btnModalGoogleLogin.innerHTML = '<span>Connexion Google en cours...</span>';
      
      const res = await firebaseSyncService.signInWithGoogle();
      btnModalGoogleLogin.disabled = false;
      btnModalGoogleLogin.innerHTML = `
        <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
        <span>Se connecter avec Google</span>
      `;

      if (res.success && res.user) {
        updateDashboardUI();
        if (currentView === 'notebook') renderNotebookUI();
        alert(`Bienvenue ${res.user.displayName || res.user.email} ! Votre progression est désormais synchronisée en direct avec votre compte Google.`);
      } else if (!res.success && res.error) {
        alert(res.error);
      }
    };
  }

  // Modal Google Logout Button
  const btnGoogleLogout = document.getElementById('btn-google-logout');
  if (btnGoogleLogout) {
    btnGoogleLogout.onclick = async () => {
      if (confirm('Voulez-vous vous déconnecter de votre compte Google sur cet appareil ? (Vos données locales restent conservées)')) {
        await firebaseSyncService.signOut();
        updateDashboardUI();
        alert('Déconnecté du compte Google.');
      }
    };
  }

  // Modal Firestore Push Button
  const btnFirestorePush = document.getElementById('btn-firestore-push');
  if (btnFirestorePush) {
    btnFirestorePush.onclick = async () => {
      btnFirestorePush.disabled = true;
      btnFirestorePush.innerHTML = '<span>Sauvegarde vers le Cloud...</span>';
      const res = await firebaseSyncService.pushToFirestore();
      btnFirestorePush.disabled = false;
      btnFirestorePush.innerHTML = '<i data-lucide="upload-cloud"></i> <span>📤 Envoyer au Cloud</span>';
      refreshLucide();
      updateModalLocalSummary();
      if (res.success) {
        alert('✅ Progression & notes de raisonnement sauvegardées sur votre compte Google Cloud !');
      } else {
        alert('❌ ' + (res.error || 'Échec de sauvegarde'));
      }
    };
  }

  // Modal Firestore Pull Button
  const btnFirestorePull = document.getElementById('btn-firestore-pull');
  if (btnFirestorePull) {
    btnFirestorePull.onclick = async () => {
      btnFirestorePull.disabled = true;
      btnFirestorePull.innerHTML = '<span>Récupération du Cloud...</span>';
      const res = await firebaseSyncService.pullFromFirestore();
      btnFirestorePull.disabled = false;
      btnFirestorePull.innerHTML = '<i data-lucide="download-cloud"></i> <span>📥 Récupérer du Cloud</span>';
      refreshLucide();
      updateModalLocalSummary();
      if (res.success) {
        updateDashboardUI();
        if (currentView === 'notebook') renderNotebookUI();
        alert('✅ Progression et notes récupérées et fusionnées avec succès depuis Google Cloud !');
      } else {
        alert('❌ ' + (res.error || 'Échec de récupération'));
      }
    };
  }

  // Toggle Firebase Configuration Panel
  const btnToggleFb = document.getElementById('btn-toggle-firebase-config');
  if (btnToggleFb) {
    btnToggleFb.onclick = () => {
      const panel = document.getElementById('firebase-config-panel');
      if (!panel) return;
      const isHidden = panel.style.display === 'none';
      panel.style.display = isHidden ? 'flex' : 'none';
      const chevron = document.getElementById('firebase-chevron');
      if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'none';
    };
  }

  // Save Firebase Configuration Button
  const btnSaveFb = document.getElementById('btn-save-firebase-config');
  if (btnSaveFb) {
    btnSaveFb.onclick = () => {
      const config = {
        apiKey: document.getElementById('fb-api-key').value.trim(),
        projectId: document.getElementById('fb-project-id').value.trim(),
        authDomain: document.getElementById('fb-auth-domain').value.trim(),
        appId: document.getElementById('fb-app-id').value.trim()
      };

      if (!config.apiKey || !config.projectId) {
        alert('Veuillez renseigner au minimum la clé API et l\'ID de projet Firebase.');
        return;
      }

      firebaseSyncService.saveConfig(config);
      alert('Configuration Firebase enregistrée et initialisée ! Vous pouvez maintenant vous connecter avec Google.');
    };
  }

  document.getElementById('btn-export-json').onclick = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(queueEngine.exportState());
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `pediadrile_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  document.getElementById('btn-import-json').onclick = () => {
    document.getElementById('file-import-input').click();
  };
  document.getElementById('file-import-input').onchange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const ok = queueEngine.importState(event.target.result);
      if (ok) {
        updateDashboardUI();
        alert('Progression importée avec succès !');
        modals.sync.style.display = 'none';
      } else {
        alert('Fichier JSON invalide.');
      }
    };
    reader.readAsText(file);
  };

  // Settings Modal
  document.getElementById('btn-open-settings').onclick = () => {
    document.getElementById('settings-gemini-key').value = geminiService.getApiKey();
    modals.settings.style.display = 'flex';
  };
  document.getElementById('btn-close-settings-modal').onclick = () => modals.settings.style.display = 'none';
  document.getElementById('btn-save-settings').onclick = () => {
    const key = document.getElementById('settings-gemini-key').value;
    geminiService.setApiKey(key);
    alert('Clé API Gemini enregistrée !');
    modals.settings.style.display = 'none';
  };

  // Modal backdrop click to close
  window.onclick = (e) => {
    Object.values(modals).forEach(m => {
      if (e.target === m) m.style.display = 'none';
    });
  };
}

// Keyboard shortcuts: 1-5, A-E, Enter, Space
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // If error modal is open, Space or Enter closes it and continues
    if (modals.error.style.display === 'flex') {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        closeErrorModalAndContinue();
      }
      return;
    }

    // Ignore keyboard shortcuts if focus is in an input or textarea
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (activeTag === 'input' || activeTag === 'textarea') {
      return;
    }

    if (currentView === 'arena') {
      // Options 1-5 or A-E
      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        selectOptionByIndex(parseInt(e.key, 10) - 1);
      } else if (['a', 'b', 'c', 'd', 'e'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        const idx = e.key.toLowerCase().charCodeAt(0) - 97;
        selectOptionByIndex(idx);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        // If success banner is showing, enter continues
        if (document.getElementById('arena-success-banner').style.display === 'flex') {
          loadNextArenaQuestion();
        } else if (!document.getElementById('btn-submit-answer').disabled) {
          handleSubmitQcm();
        }
      }
    }
  });
}

// Start application safely whether DOM is loading or already loaded
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

