// PédiaDrill - Application Controller & Orchestration
import { geminiService, cleanLatexMath } from './services/gemini.js';
import { QueueEngine } from './services/queueEngine.js';
import { FirebaseSyncService } from './services/firebaseSyncService.js';
import { studyTracker } from './services/studyTracker.js';
import { lessonTracker } from './services/lessonTracker.js';
import { updateService, CURRENT_APP_VERSION } from './services/updateService.js';

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
    if (currentView === 'stats') renderStatsUI();
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
let answeredHistory = []; // Buffer glissant des 5 derniers QCM répondus
let historyCursor = -1; // -1 = QCM actif, 0 = dernier répondu (QCM -1), 1 = (QCM -2), etc.
let isCurrentQuestionAnswered = false; // true dès que l'étudiant valide ou échoue le QCM

function isArenaChapterRevealed() {
  if (historyCursor >= 0) return true; // En mode consultation d'historique, QCM déjà répondu
  if (isCurrentQuestionAnswered) return true; // Question active déjà répondue
  const badge = document.getElementById('arena-chapter-title');
  if (badge && badge.classList.contains('is-revealed')) return true;
  return false;
}

function getEffectiveArenaQuestion() {
  if (historyCursor >= 0 && answeredHistory[historyCursor]) {
    return answeredHistory[historyCursor].question;
  }
  return currentQuestion;
}

// DOM Elements
const views = {
  dashboard: document.getElementById('view-dashboard'),
  arena: document.getElementById('view-arena'),
  notebook: document.getElementById('view-notebook'),
  stats: document.getElementById('view-stats')
};

const modals = {
  error: document.getElementById('modal-error'),
  chapters: document.getElementById('modal-chapters'),
  sync: document.getElementById('modal-sync'),
  settings: document.getElementById('modal-settings'),
  update: document.getElementById('modal-app-update')
};

// ============================================================================
// INITIALIZATION
// ============================================================================
function initApp() {
  queueEngine.setQuestions(allQuestions, allChapters);
  scrubCorruptedAiExplanations();
  studyTracker.seedFirstPassFromExistingStats(queueEngine.stats, queueEngine.getRawReasoningNotes());
  updateDashboardUI();
  setupEventListeners();
  setupKeyboardShortcuts();
  setupFirebaseService();
  initLessonTracker();
  refreshLucide();

  // Register Service Worker for offline PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('SW registration:', err);
    });
  }

  // Check for app updates via GitHub Releases in background (with 4h cooldown)
  setTimeout(() => {
    if (typeof updateService !== 'undefined' && updateService) {
      updateService.checkForUpdates(false);
    }
  }, 3000);
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
  } else if (viewName === 'stats') {
    renderStatsUI();
  }

  // Floating AI Tutor button in Arena
  const floatingAiBtn = document.getElementById('btn-arena-ai-chat');
  const arenaChatbox = document.getElementById('arena-ai-chatbox');
  if (floatingAiBtn) {
    floatingAiBtn.style.display = (viewName === 'arena') ? 'flex' : 'none';
  }
  if (viewName !== 'arena' && arenaChatbox) {
    arenaChatbox.style.display = 'none';
    if (floatingAiBtn) floatingAiBtn.classList.remove('is-active');
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
  let clean = (typeof cleanLatexMath === 'function' ? cleanLatexMath(String(text)) : String(text))
    .replace(/\$SpO_2\$/gi, 'SpO₂')
    .replace(/\$SpO2\$/gi, 'SpO₂')
    .replace(/SpO_2/gi, 'SpO₂')
    .replace(/\$PaO_2\$/gi, 'PaO₂')
    .replace(/\$PaCO_2\$/gi, 'PaCO₂')
    .replace(/\$([^\$]+)\$/g, '$1');

  let res = escapeHtml(clean);
  // Code block inline `...`
  res = res.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  // Bold + Italic ***...***
  res = res.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold **...**
  res = res.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic *...*
  res = res.replace(/(^|[^*])\*(?!\*)(.*?)(?<!\*)\*([^*]|$)/g, '$1<em>$2</em>$3');
  return res;
}

/**
 * Advanced Medical Rich Text Formatter
 * Un-glues squished questions, clinical cases, and explanations,
 * turning them into readable, structured paragraphs, medical section headers,
 * and styled bullet/numbered lists with proper vertical spacing and breathing room.
 */
function formatMedicalContent(raw) {
  if (!raw || typeof raw !== 'string') return '';

  let text = typeof cleanLatexMath === 'function' ? cleanLatexMath(raw) : raw.trim();

  // 1. Remove zero-width characters and normalize BOM
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // 2. Un-glue bullets (➢, ⁃, •, ►, ▶, ✔, ✓)
  text = text.replace(/([^\n\r])\s*([➢⁃•►▶✔✓])\s*/g, '$1\n$2 ');

  // 3. Un-glue multi-space or NBSP columns (slide tables e.g. "Streptocoque B    E. Coli    Listeria")
  text = text.replace(/[\u00a0\s]{3,}([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ0-9<])/g, '\n- $1');

  // 4. Un-glue squished words where lowercase is immediately followed by real French uppercase
  // e.g. "vaccinéContamination", "pneumonieLes", "marastiqueMaladie", "hyperpigmentationBiologie"
  text = text.replace(/([a-zàâäéèêëîïôöùûüç]{3,})([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][a-zàâäéèêëîïôöùûüç]{2,})/g, '$1.\n\n$2');

  // 5. Un-glue sentence boundaries missing spaces after periods or closing parens
  // e.g. "(TCA).Amyotrophie", "interstitiel.B/ Vrai", "peau5- Vrai", "oncotique.D/ Faux"
  text = text.replace(/([a-z0-9\)])\s*\.\s*([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ])/g, '$1. $2');
  text = text.replace(/([a-z0-9\)])\s*\.\s*(Amyotrophie|H[ée]patom[ée]galie|Distension|L[ée]sions|Biologie|An[ée]mie|Troubles?|Signes?|Phase|Aspect|Examens?|Culture|Ponction|Traitement|Diagnostic|Pronostic|Surveillance|Lutte|Am[ée]lioration|Inconv[ée]nient|Lorsque|Elle|Il|Les|La|Le|Des|En|Pour|Dans)\b/g, '$1.\n\n$2');

  // 6. Un-glue Proposition justifications: "A-Vrai", "A/ Vrai", "A : Faux", "1- Vrai", "1-Perplexe"
  // e.g. "A-Vrai :", "assurésB-Vrai:", "oncotique.D/ Faux.", "peau5- Vrai,", "l'œdème.B : Vrai,"
  text = text.replace(/(^|[^\n\r])\s*([a-eA-E])\s*[-–/:]\s*(?:-?\s*)?(Vrai|Faux|VRAI|FAUX|Fausse|Juste|Perplexe)\b/gi, '$1\n- **$2) $3** : ');
  text = text.replace(/(^|[^\n\r])\s*(\d+)\s*[-–/:]\s*(?:-?\s*)?(Vrai|Faux|VRAI|FAUX|Fausse|Juste|Perplexe)\b/gi, '$1\n- **Item $2 ($3)** : ');

  // 7. Un-glue comprehensive medical section headings
  const headings = [
    'Rappel\\s*:',
    'Rappel\\s+sur[^:]+:',
    'DEFINITION\\s+D[\'’]UNE[^:]+:',
    'D[ée]finition(?:\\s+d[\'’][\\w\\s]+)?\\s*:',
    'Remarque\\s*:',
    'Source(?:\\s+[\\w\\s0-9]+)?\\s*[:;]',
    'NB\\s*:',
    'Attention\\s*:',
    'Conduite\\s+[aà]\\s+tenir\\s*:',
    'CAT\\s*:',
    'Traitement\\s*:',
    'Diagnostic\\s*:',
    'Crit[èe]res\\s*:',
    'Signes\\s+(?:cliniques|physiques|fonctionnels|biologiques|dermatologiques)\\s*:',
    'Tableau\\s+clinique(?:\\s+de[^:]+)?\\s*:',
    'Examens?\\s+(?:compl[ée]mentaires?|syst[ée]matiques?)\\s*:',
    'Physiopathologie\\s*:',
    'Biologie\\s*:',
    'Causes?\\s*:',
    '[ÉEe]tiologies\\s*:',
    'Troubles?\\s+(?:du\\s+comportement|digestifs|neurologiques|h[ée]modynamiques|des\\s+phan[èe]res|cutan[ée]s)\\s*:',
    'L[ée]sions\\s+dermatologiques\\s*:',
    'Phase\\s+d[\'’][ée]tat\\s*:',
    'Aspect\\s+g[ée]n[ée]ral\\s*:',
    'Classifications?(?:\\s+des\\s+MPE)?\\s*:',
    'Classification\\s+de\\s+[\\w\\s]+:',
    'Chez\\s+le\\s+(?:jeune\\s+)?nourrisson(?:\\s+de\\s+[^:]+)?\\s*:',
    'Chez\\s+l[\'’]enfant\\s*:',
    '2\\s+ans\\s+et\\s+grand\\s+enfant\\s*:',
    'Le\\s+kwashiorkor(?:\\s+marastique)?\\s*:',
    'Le\\s+marasme\\s*:',
    'La\\s+m[ée]ningite(?:\\s+[aà][^:]+)?\\s*:',
    'Question\\s*\\d+\\s*:',
    'Q\\d+\\s*:',
    'En\\s+r[ée]sum[ée]\\s*:'
  ];

  headings.forEach(pattern => {
    const re = new RegExp('([^\\n\\r])\\s*(' + pattern + ')', 'gi');
    text = text.replace(re, '$1\n\n$2');
  });

  // 8. Un-glue 'Source' at end of sentence
  text = text.replace(/([^\n\r])\s*(Source\s+diapositive|Source\s*[:;])/gi, '$1\n\n$2');

  // 9. Normalize combined bullet-number items: "- 1. ..." -> "1. ..."
  text = text.replace(/^[-•*➢⁃►▶✔✓]\s*(\d+[\.\)-]\s+)/gm, '$1');

  // 10. Un-glue QCM sub-items: "1- ...", "2- ...", "1. ...", "1) ..."
  text = text.replace(/([^\n\r\-•*➢⁃►▶✔✓])\s+(\d+[\.\)-]\s+[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ])/g, '$1\n$2');
  text = text.replace(/([^\n\r\-•*➢⁃►▶✔✓])\s+([a-eA-E][\.\)]\s+[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ])/g, '$1\n$2');

  // 11. Clean up multiple empty lines
  text = text.replace(/\n{3,}/g, '\n\n');

  // 11. Split into lines
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let html = '<div class="medical-formatted-content">';
  let inBulletList = false;
  let inNumList = false;

  const closeLists = () => {
    if (inBulletList) { html += '</ul>'; inBulletList = false; }
    if (inNumList) { html += '</ul>'; inNumList = false; }
  };

  lines.forEach(line => {
    // Check if line is a Section Title (or starts with a section title)
    const headerMatch = line.match(/^((?:Rappel|D[ée]finition|DEFINITION|Remarque|Source|NB|Attention|Conduite|CAT|Traitement|Diagnostic|Crit[èe]res|Signes|Tableau|Examens|Physiopathologie|Biologie|Causes|Etiologies|[ÉEe]tiologies|Troubles|L[ée]sions|Phase|Aspect|Classifications?|Chez|2\s+ans|Le\s+kwashiorkor|Le\s+marasme|La\s+m[ée]ningite|Question\s*\d+|Q\d+)[^:]*[:;])\s*(.*)$/i);

    if (headerMatch) {
      closeLists();
      const titleText = headerMatch[1].trim();
      const afterText = headerMatch[2] ? headerMatch[2].trim() : '';

      let icon = 'info';
      let titleClass = 'medical-section-title';
      if (/rappel/i.test(titleText)) {
        icon = 'bookmark';
        titleClass += ' title-rappel';
      } else if (/source/i.test(titleText)) {
        icon = 'book-open';
        titleClass += ' title-source';
      } else if (/question|q\d+/i.test(titleText)) {
        icon = 'help-circle';
        titleClass += ' title-question';
      } else if (/biologie|examen/i.test(titleText)) {
        icon = 'activity';
        titleClass += ' title-bio';
      } else if (/signe|tableau|trouble/i.test(titleText)) {
        icon = 'stethoscope';
        titleClass += ' title-clinical';
      }

      html += `<div class="${titleClass}"><i data-lucide="${icon}"></i><span>${parseMarkdownInline(titleText)}</span></div>`;
      if (afterText) {
        html += `<p class="medical-paragraph">${parseMarkdownInline(afterText)}</p>`;
      }
      return;
    }

    // Bullet items
    const bulletMatch = line.match(/^([➢⁃•►▶✔✓\*\-]\s*)(.*)$/);
    if (bulletMatch) {
      if (inNumList) { html += '</ul>'; inNumList = false; }
      if (!inBulletList) { html += '<ul class="medical-bullet-list">'; inBulletList = true; }
      const bulletChar = bulletMatch[1].trim() || '•';
      const content = bulletMatch[2].trim();
      html += `<li class="medical-bullet-item"><span class="medical-bullet-icon">${escapeHtml(bulletChar)}</span><div class="medical-bullet-text">${parseMarkdownInline(content)}</div></li>`;
      return;
    }

    // Numbered items
    const numMatch = line.match(/^(\d+)(?:[-–\.]|\))\s+(.*)$/);
    if (numMatch) {
      if (inBulletList) { html += '</ul>'; inBulletList = false; }
      if (!inNumList) { html += '<ul class="medical-num-list">'; inNumList = true; }
      const num = numMatch[1];
      const content = numMatch[2].trim();
      html += `<li class="medical-num-item"><span class="medical-num-badge">${escapeHtml(num)}</span><div class="medical-num-text">${parseMarkdownInline(content)}</div></li>`;
      return;
    }

    // Regular paragraph
    closeLists();
    html += `<p class="medical-paragraph">${parseMarkdownInline(line)}</p>`;
  });

  closeLists();
  html += '</div>';
  return html;
}
window.cleanLatexMath = cleanLatexMath;
window.formatMedicalContent = formatMedicalContent;

function formatReasoningNote(noteText) {
  if (!noteText || typeof noteText !== 'string' || !noteText.trim()) {
    return '<div class="reasoning-cards-container"><div class="reasoning-card card-method"><div class="reasoning-card-body">Aucune note de raisonnement clinique disponible.</div></div></div>';
  }

  const raw = typeof cleanLatexMath === 'function' ? cleanLatexMath(noteText) : noteText.trim();

  // Regex patterns to capture the 4 structured sections from Gemini 3.8 Flash
  const sec1Regex = /(?:###\s*|\*\*|#\s*)?(?:1[\.\)]\s*)?🎯\s*PI[ÈÉEeèéê]GE[^\n:]*[:\n]([\s\S]*?)(?=(?:###\s*|\*\*|#\s*)?(?:2[\.\)]\s*)?📋\s*JUSTIFICATION|(?:###\s*|\*\*|#\s*)?(?:3[\.\)]\s*)?🩺\s*D[ÉEèéê]MARCHE|(?:###\s*|\*\*|#\s*)?(?:2[\.\)]\s*)?🩺\s*M[ÉEèéê]THODE|$)/i;
  const sec2Regex = /(?:###\s*|\*\*|#\s*)?(?:2[\.\)]\s*)?📋\s*JUSTIFICATION[^\n:]*[:\n]([\s\S]*?)(?=(?:###\s*|\*\*|#\s*)?(?:3[\.\)]\s*)?🩺\s*D[ÉEèéê]MARCHE|(?:###\s*|\*\*|#\s*)?(?:4[\.\)]\s*)?💡\s*R[ÈÉEeèéê]GLE|$)/i;
  const sec3Regex = /(?:###\s*|\*\*|#\s*)?(?:[23][\.\)]\s*)?🩺\s*(?:D[ÉEèéê]MARCHE|M[ÉEèéê]THODE)[^\n:]*[:\n]([\s\S]*?)(?=(?:###\s*|\*\*|#\s*)?(?:[34][\.\)]\s*)?💡\s*R[ÈÉEeèéê]GLE|$)/i;
  const sec4Regex = /(?:###\s*|\*\*|#\s*)?(?:[34][\.\)]\s*)?💡\s*R[ÈÉEeèéê]GLE[^\n:]*[:\n]([\s\S]*?)$/i;

  const match1 = raw.match(sec1Regex);
  const match2 = raw.match(sec2Regex);
  const match3 = raw.match(sec3Regex);
  const match4 = raw.match(sec4Regex);

  const renderSectionContent = (contentRaw) => {
    if (!contentRaw) return '';
    let clean = contentRaw.trim()
      .replace(/^[\s\-–—*]{3,}\s*$/gm, '') // Strip horizontal rule lines
      .trim();

    const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
    let out = '';
    let inList = false;
    let inQuote = false;

    lines.forEach(line => {
      // Skip divider lines
      if (/^[\-–—*]{3,}$/.test(line)) return;

      // Blockquotes (> ...) for golden memos and rules
      const quoteMatch = line.match(/^>\s*(.*)$/);
      if (quoteMatch) {
        if (inList) { out += '</ul>'; inList = false; }
        if (!inQuote) { out += '<blockquote class="reasoning-callout-quote">'; inQuote = true; }
        out += `<p>${parseMarkdownInline(quoteMatch[1])}</p>`;
        return;
      } else if (inQuote) {
        out += '</blockquote>';
        inQuote = false;
      }

      // Bullet items (-, •, *)
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
    if (inQuote) out += '</blockquote>';
    return out;
  };

  if (match1 || match2 || match3 || match4) {
    let html = '<div class="reasoning-cards-container">';

    if (match1 && match1[1] && match1[1].trim()) {
      html += `
        <div class="reasoning-card card-trap">
          <div class="reasoning-card-header">
            <span class="reasoning-badge badge-trap">
              <span class="badge-icon">🎯</span>
              <span>Piège Clinique & Analyse de l'Erreur</span>
            </span>
          </div>
          <div class="reasoning-card-body">${renderSectionContent(match1[1])}</div>
        </div>`;
    }

    if (match2 && match2[1] && match2[1].trim()) {
      html += `
        <div class="reasoning-card card-options-analysis">
          <div class="reasoning-card-header">
            <span class="reasoning-badge badge-options-analysis">
              <span class="badge-icon">📋</span>
              <span>Justification Proposition par Proposition</span>
            </span>
          </div>
          <div class="reasoning-card-body">${renderSectionContent(match2[1])}</div>
        </div>`;
    }

    if (match3 && match3[1] && match3[1].trim()) {
      html += `
        <div class="reasoning-card card-method">
          <div class="reasoning-card-header">
            <span class="reasoning-badge badge-method">
              <span class="badge-icon">🩺</span>
              <span>Démarche Clinique & Raisonnement</span>
            </span>
          </div>
          <div class="reasoning-card-body">${renderSectionContent(match3[1])}</div>
        </div>`;
    }

    if (match4 && match4[1] && match4[1].trim()) {
      html += `
        <div class="reasoning-card card-rule">
          <div class="reasoning-card-header">
            <span class="reasoning-badge badge-rule">
              <span class="badge-icon">💡</span>
              <span>Règle d'Or & Mémo Concours</span>
            </span>
          </div>
          <div class="reasoning-card-body">${renderSectionContent(match4[1])}</div>
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

// ============================================================================
// MEDICAL MEDIA (PHOTOS) - SPOILER / RETRACTED & BLURRED BY DEFAULT
// ============================================================================
function renderQuestionMedia(mediaUrls) {
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
          <i data-lucide="image" style="width:13px;height:13px;color:var(--cyan);"></i>
          <span>Iconographie médicale (${count} photo${count > 1 ? 's' : ''})</span>
        </div>
        <span style="font-size:0.68rem;color:var(--text-dim);font-weight:500;">
          Floutée par défaut • Toucher pour afficher
        </span>
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
  refreshLucide();
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
      el.title = 'Cours masqué jusqu\'à ce que vous répondiez (Cliquer pour afficher)';
    }
  });

  refreshLucide();
};

window.openMediaLightbox = function(url, event) {
  if (event) event.stopPropagation();
  let modal = document.getElementById('media-lightbox-modal');
  let img = document.getElementById('media-lightbox-img');

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
        <img id="media-lightbox-img" src="" alt="Iconographie Pédiatrique HD">
      </div>
    `;
    document.body.appendChild(modal);
    img = document.getElementById('media-lightbox-img');
  }

  if (img) img.src = url;
  modal.style.display = 'flex';
  refreshLucide();
};

window.closeMediaLightbox = function() {
  const modal = document.getElementById('media-lightbox-modal');
  if (modal) {
    modal.style.display = 'none';
  }
};

/**
 * Format complete structured recap: Full Question Statement, All Options (A-E),
 * Student's Choice, Correct Choice and Official Database Explanation
 */
function formatQuestionMistakeRecap(question, userSelectedLetters, isCroq = false, userCroqText = '', score = null) {
  if (!question) return '';

  const effectiveIsCroq = isCroq || (question && question.type === 'CROQ');

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
    // QCM / QCU - Afficher uniquement la liste exhaustive des propositions (A à E) avec coloration et statut
    const options = question.options || [];
    const correctOptions = options.filter(o => o.is_correct);
    const correctLetters = correctOptions.map(o => o.letter).sort();

    optionsOrCroqHtml = `
      <!-- Examen Exhaustif de Toutes les Propositions (A à E) avec Coloration & Statut -->
      <div class="mistake-options-container">
        <div class="mistake-options-header">
          <div style="display:flex;align-items:center;gap:6px;">
            <i data-lucide="list-checks" style="width:16px;height:16px;color:var(--cyan);"></i>
            <span style="font-weight:700;font-size:0.88rem;color:var(--text-main);">Toutes les propositions (A à E) &amp; Statut détaillé :</span>
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);">
            Bonne(s) réponse(s) : <strong class="text-emerald">${correctLetters.join(', ')}</strong>
          </div>
        </div>
        <div class="mistake-options-list">
          ${options.map(opt => {
            const isCorrect = !!opt.is_correct;
            const isUserSelected = lettersArr.includes(opt.letter);

            let rowClass = 'opt-row-neutral';
            let badgeHtml = '';

            if (isUserSelected && !isCorrect) {
              rowClass = 'opt-row-wrong'; // RED
              badgeHtml = `<span class="opt-status-badge badge-wrong"><i data-lucide="x"></i> Mon choix (Faux)</span>`;
            } else if (isUserSelected && isCorrect) {
              rowClass = 'opt-row-correct-chosen'; // GREEN
              badgeHtml = `<span class="opt-status-badge badge-correct"><i data-lucide="check"></i> Mon choix (Juste)</span>`;
            } else if (!isUserSelected && isCorrect) {
              rowClass = 'opt-row-correct-missed'; // GREEN border / subtle green
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
          <span class="tag-pill tag-qcu" style="font-size:0.7rem;padding:2px 8px;">${escapeHtml(question.chapterTitle || 'Pédiatrie')}</span>
          <span class="tag-pill ${isCroq ? 'tag-croq' : 'tag-qcu'}" style="font-size:0.7rem;padding:2px 8px;">${isCroq ? 'CROQ' : 'QCM'}</span>
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

// Backward-compatible fallback helper
function formatAnswerComparison(userAnswer, correctAnswer, isCroq = false, score = null) {
  if (currentQuestion) {
    const letters = userAnswer ? userAnswer.split(',').map(s => s.trim().toUpperCase()) : [];
    return formatQuestionMistakeRecap(currentQuestion, letters, isCroq, userAnswer, score);
  }
  return `
    <div class="answer-comparison-grid">
      <div class="answer-box box-user">
        <div class="answer-box-header">
          <span class="answer-box-title text-rose"><span class="box-icon">✕</span> Votre choix :</span>
        </div>
        <div class="answer-box-content"><strong>${escapeHtml(userAnswer || 'Aucun')}</strong></div>
      </div>
      <div class="answer-box box-correct">
        <div class="answer-box-header">
          <span class="answer-box-title text-emerald"><span class="box-icon">✓</span> Bonne réponse :</span>
        </div>
        <div class="answer-box-content"><strong>${escapeHtml(correctAnswer || '')}</strong></div>
      </div>
    </div>
  `;
}

// ============================================================================
// QUESTION DATE & SESSION EXTRACTION
// ============================================================================
function extractQuestionDateOrSession(q) {
  if (!q) return '';
  let rawDate = '';
  
  // 1. Direct metadata properties on the question object
  if (q.session && typeof q.session === 'string' && q.session.trim()) rawDate = q.session.trim();
  else if (q.session_type && (q.year || q.annee)) rawDate = String(q.session_type).trim() + ' ' + String(q.year || q.annee).trim();
  else if (q.date && typeof q.date === 'string' && q.date.trim()) rawDate = q.date.trim();
  else if (q.source_date && typeof q.source_date === 'string') rawDate = q.source_date.trim();
  else if (q.year && (typeof q.year === 'string' || typeof q.year === 'number')) rawDate = String(q.year).trim();

  // 2. Sift text fields if not directly specified in object properties
  if (!rawDate) {
    const texts = [q.explanation || '', q.clinical_case || '', q.question || ''];
    const full = texts.join(' \n ');

    // Match Résidanat (e.g. Résidanat 2021, Residanat 19, Résidanat Alger 2020)
    const resMatch = full.match(/\b(R[ée]sidanat(?:\s+[A-Za-z]+)?\s*[-_:/]?\s*(?:20\d\d|19\d\d|\b[0-2]\d\b))\b/i);
    if (resMatch) {
      rawDate = resMatch[1].trim();
    } else {
      // Match Rattrapage (e.g. Rattrapage 2021, Ratrapage 19, R 2020)
      const ratMatch = full.match(/\b(Rat(?:t)?rapage\s*[-_:/]?\s*(?:20\d\d|19\d\d|\b[0-2]\d\b)|\bR\s*[-_:/]?\s*(?:20\d\d))\b/i);
      if (ratMatch) {
        rawDate = ratMatch[1].trim();
      } else {
        // Match Principale / P (e.g. Principale 2020, P 2021, P1 2019, P2 2020, P 19)
        const pMatch = full.match(/\b(Principale\s*[-_:/]?\s*(?:20\d\d|19\d\d|\b[0-2]\d\b)|\bP\s*[12]?\s*[-_:/]?\s*(?:20\d\d))\b/i);
        if (pMatch) {
          rawDate = pMatch[1].trim();
        } else {
          // Match EMD or Session
          const emdMatch = full.match(/\b(EMD\s*[123]?\s*[-_:/]?\s*(?:20\d\d|19\d\d|\b[0-2]\d\b)|Session\s*[-_:/]?\s*(?:20\d\d|19\d\d))\b/i);
          if (emdMatch) {
            rawDate = emdMatch[1].trim();
          } else {
            // Match official medical source mentions with year (Diapositive 2024, iKb, Guide)
            const sourceMatch = full.match(/\b(Diapo(?:sitive)?|iKb|Guide|Cours|Uptodate|R[ée]f[ée]rentiel|Recommandation|HAS)\b\s*[^.,;\n]*20\d\d(?:\/20\d\d)?/i);
            if (sourceMatch) {
              const cleaned = sourceMatch[0].replace(/^(?:Source\s*[:;]?\s*)/i, '').trim();
              if (cleaned.length <= 35) rawDate = cleaned;
            }
          }
        }
      }
    }
  }

  if (!rawDate) return '';

  // Canonical session & date normalization
  // 1. Résidanat (e.g. "Résidanat 2022", "residanat alger 18", "Résidanat 19")
  let m = rawDate.match(/r[ée]sidanat(?:\s+([a-z]+))?\s*[-_/:]?\s*('?(?:20\d\d|19\d\d|[0-2]\d))\b/i);
  if (m) {
    let year = m[2].replace("'", '');
    if (year.length === 2) year = (parseInt(year, 10) > 50 ? '19' : '20') + year;
    const city = m[1] ? (' ' + m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()) : '';
    return 'Résidanat' + city + ' ' + year;
  }

  // 2. Rattrapage / R (e.g. "Rattrapage 2020", "ratrapage 19", "R 2022")
  m = rawDate.match(/(?:rat(?:t)?rapage|(?:\bR))\s*([12])?\s*[-_/:]?\s*('?(?:20\d\d|19\d\d|[0-2]\d))\b/i);
  if (m) {
    let year = m[2].replace("'", '');
    if (year.length === 2) year = (parseInt(year, 10) > 50 ? '19' : '20') + year;
    return 'Rattrapage ' + year;
  }

  // 3. Principale / P (e.g. "Principale 2020", "P 2021", "P1 2021", "p 19")
  m = rawDate.match(/(?:principale|(?:\bP))\s*([12])?\s*[-_/:]?\s*('?(?:20\d\d|19\d\d|[0-2]\d))\b/i);
  if (m) {
    const pNum = m[1] ? m[1] : '';
    let year = m[2].replace("'", '');
    if (year.length === 2) year = (parseInt(year, 10) > 50 ? '19' : '20') + year;
    return 'P' + (pNum ? pNum + ' ' : ' ') + year;
  }

  // 4. EMD (e.g. "EMD 2020", "EMD1 2021")
  m = rawDate.match(/emd\s*([123])?\s*[-_/:]?\s*('?(?:20\d\d|19\d\d|[0-2]\d))\b/i);
  if (m) {
    const emdNum = m[1] ? m[1] : '';
    let year = m[2].replace("'", '');
    if (year.length === 2) year = (parseInt(year, 10) > 50 ? '19' : '20') + year;
    return 'EMD' + (emdNum ? emdNum + ' ' : ' ') + year;
  }

  return rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
}

// ============================================================================
// PERSISTENT AI EXPLANATIONS FOR ARENA QUESTIONS
// ============================================================================
let aiExplanationsCache = {};
try {
  const rawCache = localStorage.getItem('pedia_ai_explanations_cache');
  if (rawCache) {
    const parsed = JSON.parse(rawCache);
    if (parsed && typeof parsed === 'object') aiExplanationsCache = parsed;
  }
} catch (e) {
  console.warn('Failed to load AI explanations cache:', e);
}

/**
 * Validates that an AI reasoning note semantically matches the target question.
 * Protects against race condition corruption where a note from Question A is saved to Question B.
 */
function isExplanationMatchingQuestion(noteText, question) {
  if (!noteText || typeof noteText !== 'string' || !question) return false;

  const noteLower = noteText.toLowerCase();

  // 1. Explicit theme mismatch check:
  // If the note has "Thème clé : *XYZ*" and XYZ has zero word overlap with question.chapterTitle, it's a mismatch
  const themeMatch = noteText.match(/Thème clé\s*:\s*\*?([^\n\*\r\<\>]+)\*?/i);
  if (themeMatch && question.chapterTitle) {
    const noteTheme = themeMatch[1].trim().toLowerCase();
    const qChapter = question.chapterTitle.trim().toLowerCase();
    const cleanWords = (s) => (s || '').replace(/[^a-z0-9à-öø-ÿ]/gi, ' ').split(/\s+/).filter(w => w.length >= 4);
    const themeWords = cleanWords(noteTheme);
    const chapterWords = cleanWords(qChapter);
    const hasCommonWord = themeWords.some(tw => chapterWords.some(cw => tw.includes(cw) || cw.includes(tw)));
    if (!hasCommonWord && themeWords.length > 0 && chapterWords.length > 0) {
      return false; // Clear chapter mismatch!
    }
  }

  // 2. Options keyword overlap check for QCMs and CROQs
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
    // For CROQ questions
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

/**
 * Automatically purges any previously corrupted or mismatched AI explanations
 * stored in localStorage or the Spaced Repetition Notebook.
 */
function scrubCorruptedAiExplanations() {
  try {
    let purgedCacheCount = 0;
    for (const [uid, item] of Object.entries(aiExplanationsCache)) {
      if (!item || !item.note) continue;
      const q = allQuestions.find(it => it.uid === uid);
      if (!q || !isExplanationMatchingQuestion(item.note, q)) {
        delete aiExplanationsCache[uid];
        purgedCacheCount++;
      }
    }
    if (purgedCacheCount > 0) {
      localStorage.setItem('pedia_ai_explanations_cache', JSON.stringify(aiExplanationsCache));
      console.log(`[Diagnostic IA] Purged ${purgedCacheCount} mismatched AI explanation(s) from local cache.`);
    }

    // Scrub notebook notes in QueueEngine
    const rawNotes = queueEngine.getRawReasoningNotes();
    let purgedNotesCount = 0;
    const cleanedNotes = rawNotes.filter(n => {
      if (!n || !n.questionUid || !n.reasoningNote) return true;
      const q = allQuestions.find(it => it.uid === n.questionUid);
      if (q && !isExplanationMatchingQuestion(n.reasoningNote, q)) {
        purgedNotesCount++;
        return false;
      }
      return true;
    });

    if (purgedNotesCount > 0) {
      localStorage.setItem('pedia_drill_reasoning_notes_v1', JSON.stringify(cleanedNotes));
      console.log(`[Diagnostic IA] Purged ${purgedNotesCount} mismatched AI reasoning note(s) from Notebook.`);
      firebaseSyncService.triggerAutoPush();
    }
  } catch (err) {
    console.warn('[Diagnostic IA] Error while scrubbing explanations:', err);
  }
}

function getSavedAiExplanation(questionUid, question = null) {
  if (!questionUid) return null;

  const targetQ = question || (allQuestions.find(q => q.uid === questionUid) || null);

  const checkAndClean = (entry, source) => {
    if (!entry || !entry.note) return null;
    if (targetQ && !isExplanationMatchingQuestion(entry.note, targetQ)) {
      console.warn(`[AI Explanation] Mismatched note detected from ${source} for ${questionUid}. Purging corrupted entry.`);
      if (source === 'cache') {
        delete aiExplanationsCache[questionUid];
        try {
          localStorage.setItem('pedia_ai_explanations_cache', JSON.stringify(aiExplanationsCache));
        } catch {}
      }
      return null;
    }
    return entry;
  };

  // 1. In-memory cache
  if (aiExplanationsCache[questionUid]) {
    const valid = checkAndClean(aiExplanationsCache[questionUid], 'cache');
    if (valid) return valid;
  }
  // 2. Answered history buffer
  const histItem = answeredHistory.find(h => h.question && h.question.uid === questionUid && h.aiReasoning);
  if (histItem) {
    const entry = { note: histItem.aiReasoning, modelUsed: histItem.modelUsed || 'Gemini 3.8 Flash' };
    const valid = checkAndClean(entry, 'history');
    if (valid) return valid;
    histItem.aiReasoning = null;
    histItem.modelUsed = null;
  }
  // 3. QueueEngine reasoning notes (from notebook or synced from Firestore)
  const notes = queueEngine.getReasoningNotes();
  const note = notes.find(n => n.questionUid === questionUid && n.reasoningNote);
  if (note) {
    const entry = { note: note.reasoningNote, modelUsed: note.modelUsed || 'Gemini 3.8 Flash' };
    const valid = checkAndClean(entry, 'notebook');
    if (valid) return valid;
    if (note.id) {
      queueEngine.deleteReasoningNote(note.id);
    }
  }
  return null;
}

function saveAiExplanationForQuestion(questionUid, noteText, modelUsed = 'Gemini 3.8 Flash', question = null) {
  if (!questionUid || !noteText) return;

  const targetQ = question || (allQuestions.find(q => q.uid === questionUid) || null);
  if (targetQ && !isExplanationMatchingQuestion(noteText, targetQ)) {
    console.warn(`[AI Explanation] Refusing to save mismatched note for ${questionUid}`);
    return;
  }

  aiExplanationsCache[questionUid] = {
    note: noteText,
    modelUsed: modelUsed || 'Gemini 3.8 Flash',
    questionText: targetQ ? (targetQ.question || targetQ.statement) : '',
    chapterTitle: targetQ ? targetQ.chapterTitle : '',
    timestamp: Date.now()
  };
  try {
    localStorage.setItem('pedia_ai_explanations_cache', JSON.stringify(aiExplanationsCache));
  } catch (e) {
    console.warn('Failed to persist AI explanations cache:', e);
  }

  // Update in answeredHistory if present
  answeredHistory.forEach(item => {
    if (item.question && item.question.uid === questionUid) {
      item.aiReasoning = noteText;
      item.modelUsed = modelUsed;
    }
  });

  // Ensure it is saved in queueEngine Notebook
  const existingNotes = queueEngine.getReasoningNotes();
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
      isCroq: isCroq,
      score: null,
      reasoningNote: noteText,
      modelUsed: modelUsed,
      timestamp: Date.now()
    };
    queueEngine.saveReasoningNote(noteRecord);
    firebaseSyncService.triggerAutoPush();
    const notesCount = queueEngine.getReasoningNotes().length;
    const badgeEl = document.getElementById('notebook-count-badge');
    if (badgeEl) badgeEl.textContent = notesCount;
  }
}

function renderArenaAiExplanation(question) {
  const box = document.getElementById('arena-ai-explanation-box');
  const textEl = document.getElementById('arena-ai-explanation-text');
  const modelTag = document.getElementById('arena-ai-model-tag');
  const regenBtn = document.getElementById('btn-arena-ai-regenerate');
  if (!box || !textEl || !question) return;

  const saved = getSavedAiExplanation(question.uid, question);
  box.style.display = 'flex';

  if (saved && saved.note) {
    if (modelTag) modelTag.textContent = saved.modelUsed || 'Gemini 3.8 Flash';
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
  refreshLucide();
}

window.regenerateArenaAiExplanation = async function() {
  const effQ = getEffectiveArenaQuestion();
  if (!effQ) return;
  const targetUid = effQ.uid;

  delete aiExplanationsCache[targetUid];
  try {
    localStorage.setItem('pedia_ai_explanations_cache', JSON.stringify(aiExplanationsCache));
  } catch {}

  answeredHistory.forEach(item => {
    if (item.question && item.question.uid === targetUid) {
      item.aiReasoning = null;
      item.modelUsed = null;
    }
  });

  queueEngine.deleteReasoningNotesByQuestionUid(targetUid);
  await window.requestArenaAiExplanation(true);
};

window.requestArenaAiExplanation = async function(forceRegen = false) {
  const effQ = getEffectiveArenaQuestion();
  if (!effQ) return;
  const targetUid = effQ.uid;
  const box = document.getElementById('arena-ai-explanation-box');
  const textEl = document.getElementById('arena-ai-explanation-text');
  const modelTag = document.getElementById('arena-ai-model-tag');
  const regenBtn = document.getElementById('btn-arena-ai-regenerate');
  if (!box || !textEl) return;

  if (regenBtn) regenBtn.style.display = 'none';
  box.style.display = 'flex';
  textEl.innerHTML = `
    <div class="reasoning-loader-wrap" style="padding:16px;text-align:center;">
      <i data-lucide="sparkles" class="spin" style="width:20px;height:20px;color:var(--cyan);margin-bottom:8px;"></i>
      <div style="font-size:0.88rem;color:var(--cyan);font-weight:600;">Génération de l'explication clinique IA complète (Gemini Flash)...</div>
      <div style="font-size:0.75rem;color:var(--text-dim);margin-top:4px;">Justification détaillée proposition par proposition et mémo concours.</div>
    </div>
  `;
  refreshLucide();

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
      refreshLucide();
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
      refreshLucide();
    }
  }
};

// ============================================================================
// ARENA HISTORY NAVIGATION (RETROUVER LES 5 DERNIERS QCM RÉPONDUS)
// ============================================================================
function pushToAnsweredHistory(question, userAnswerLetters, isCorrect, score = null) {
  if (!question) return;
  const savedAi = getSavedAiExplanation(question.uid, question);
  const snapshot = {
    question: JSON.parse(JSON.stringify(question)),
    userAnswerLetters: Array.isArray(userAnswerLetters) ? [...userAnswerLetters] : (userAnswerLetters ? [userAnswerLetters] : []),
    isCorrect: !!isCorrect,
    score: score,
    explanation: question.explanation || '',
    aiReasoning: savedAi ? savedAi.note : null,
    modelUsed: savedAi ? savedAi.modelUsed : null,
    timestamp: Date.now()
  };

  // Éviter les doublons consécutifs sur la même question
  if (answeredHistory.length > 0 && answeredHistory[0].question.uid === question.uid) {
    answeredHistory[0] = snapshot;
  } else {
    answeredHistory.unshift(snapshot);
    if (answeredHistory.length > 5) {
      answeredHistory = answeredHistory.slice(0, 5);
    }
  }
  updateHistoryNavUI();
}

function updateHistoryNavUI() {
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

  if (historyCursor === -1) {
    // Mode Actuel (Drill en cours)
    prevBtn.disabled = (answeredHistory.length === 0);
    nextBtn.disabled = true;
    labelEl.textContent = answeredHistory.length > 0 ? `Actuel (${answeredHistory.length})` : 'Actuel';
    if (badgeEl) badgeEl.classList.remove('is-past');
    if (navBox) navBox.classList.remove('is-browsing');
    if (bannerEl) bannerEl.style.display = 'none';
    if (resumeActionBtn) resumeActionBtn.style.display = 'none';
    if (currentQuestion) {
      if (currentQuestion.is_croq) {
        if (btnSubmitCroq) btnSubmitCroq.style.display = 'flex';
      } else {
        if (btnSubmitAnswer) btnSubmitAnswer.style.display = 'flex';
      }
    }
  } else {
    // Mode Consultation Historique (Lecture seule + Tuteur IA)
    prevBtn.disabled = (historyCursor >= answeredHistory.length - 1);
    nextBtn.disabled = false;
    labelEl.textContent = `Précédent ${historyCursor + 1}/${answeredHistory.length}`;
    if (badgeEl) badgeEl.classList.add('is-past');
    if (navBox) navBox.classList.add('is-browsing');
    if (bannerEl) bannerEl.style.display = 'flex';
    if (resumeActionBtn) resumeActionBtn.style.display = 'inline-flex';
    if (btnSubmitAnswer) btnSubmitAnswer.style.display = 'none';
    if (btnSubmitCroq) btnSubmitCroq.style.display = 'none';
    if (shortcutHint) shortcutHint.textContent = 'Mode Révision : QCM en lecture seule & Tuteur IA actif';
  }
}

function renderHistoryQuestion(historyEntry) {
  if (!historyEntry || !historyEntry.question) return;
  const q = historyEntry.question;

  // Mise à jour immédiate du contexte Tuteur IA
  arenaChatHistory = [];
  updateArenaChatContext();
  const chatboxEl = document.getElementById('arena-ai-chatbox');
  if (chatboxEl && chatboxEl.style.display !== 'none') {
    renderChatWelcome();
  }

  // Masquer la bannière de succès
  document.getElementById('arena-success-banner').style.display = 'none';

  // Mise à jour visuelle des boutons et indicateurs de navigation
  updateHistoryNavUI();

  // Badge du cours (affiché en clair sans floutage en mode révision)
  const chapterBadge = document.getElementById('arena-chapter-title');
  if (chapterBadge) {
    chapterBadge.classList.remove('is-blurred');
    chapterBadge.classList.add('is-revealed');
    chapterBadge.title = 'Chapitre du QCM révisé';
    const dateStr = extractQuestionDateOrSession(q);
    const dateBadgeHtml = dateStr ? `<span class="question-date-pill" title="Date ou session du QCM : ${escapeHtml(dateStr)}"><i data-lucide="calendar" style="width:11px;height:11px;"></i> ${escapeHtml(dateStr)}</span>` : '';
    chapterBadge.innerHTML = `
      <span class="chapter-title-text">Pédiatrie — ${escapeHtml(q.chapterTitle || 'Général')}${dateBadgeHtml ? ' ' + dateBadgeHtml : ''}</span>
      <span class="chapter-title-hint" style="color:var(--amber);"><i data-lucide="history" style="width:11px;height:11px;"></i> QCM Répondu</span>
    `;
  }

  // Badges Type & Progression
  const typePill = document.getElementById('arena-type-pill');
  if (typePill) {
    typePill.textContent = q.type || 'QCM';
    typePill.className = `tag-pill tag-${(q.type || 'QCM').toLowerCase()}`;
  }

  const progressPill = document.getElementById('arena-progress-pill');
  if (progressPill) {
    const stats = queueEngine.getQuestionStats(q.uid);
    progressPill.textContent = historyEntry.isCorrect ? `✅ Répondu Juste` : `⚠️ Répondu Faux (${stats.mistakes} faute${stats.mistakes > 1 ? 's' : ''})`;
    progressPill.className = historyEntry.isCorrect ? 'tag-pill progress-pill' : 'tag-pill progress-penalized';
  }

  // Cas Clinique
  const clinicalBox = document.getElementById('arena-clinical-case');
  const clinicalText = document.getElementById('arena-clinical-case-text');
  if (q.clinical_case && q.clinical_case.trim()) {
    clinicalText.innerHTML = formatMedicalContent(q.clinical_case.trim());
    clinicalBox.style.display = 'block';
  } else {
    clinicalBox.style.display = 'none';
  }

  // Énoncé de la question
  document.getElementById('arena-question-text').innerHTML = formatMedicalContent(q.question || q.statement);

  // Iconographie / Médias
  const mediaWrap = document.getElementById('arena-media-wrap');
  if (q.media_urls && q.media_urls.length > 0) {
    mediaWrap.innerHTML = renderQuestionMedia(q.media_urls);
    mediaWrap.style.display = 'block';
    refreshLucide();
  } else {
    mediaWrap.innerHTML = '';
    mediaWrap.style.display = 'none';
  }

  // Affichage en lecture seule (Options QCM vs CROQ)
  const optionsContainer = document.getElementById('arena-options-container');
  const croqContainer = document.getElementById('arena-croq-container');
  const btnSubmitAnswer = document.getElementById('btn-submit-answer');
  const btnSubmitCroq = document.getElementById('btn-submit-croq');
  const resumeBtn = document.getElementById('btn-history-resume-action');

  btnSubmitAnswer.style.display = 'none';
  btnSubmitCroq.style.display = 'none';
  if (resumeBtn) resumeBtn.style.display = 'inline-flex';

  if (q.is_croq) {
    optionsContainer.style.display = 'none';
    croqContainer.style.display = 'flex';
    const croqInput = document.getElementById('arena-croq-input');
    croqInput.value = historyEntry.userAnswerLetters?.[0] || '';
    croqInput.disabled = true;
  } else {
    croqContainer.style.display = 'none';
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
        <div class="option-letter">${letter}</div>
        <div class="option-text">${opt.text}</div>
        ${statusBadge}
      `;
      optionsContainer.appendChild(item);
    });
  }

  // Boîte d'explication officielle ouverte automatiquement
  const expBox = document.getElementById('arena-explanation-box');
  const expText = document.getElementById('arena-explanation-text');
  if (expBox && expText) {
    if (q.explanation && q.explanation.trim()) {
      expText.innerHTML = formatMedicalContent(q.explanation.trim());
    } else {
      expText.innerHTML = `<em>Réponse officielle de référence pour le cours <strong>${escapeHtml(q.chapterTitle || 'Pédiatrie')}</strong>.</em>`;
    }
    expBox.style.display = 'flex';
  }

  // Restituer et afficher l'explication clinique IA sauvegardée
  renderArenaAiExplanation(q);

  refreshLucide();
}

window.navigateHistoryPrev = function() {
  if (answeredHistory.length === 0) return;
  if (historyCursor < answeredHistory.length - 1) {
    historyCursor++;
    renderHistoryQuestion(answeredHistory[historyCursor]);
  }
};

window.navigateHistoryNext = function() {
  if (historyCursor > 0) {
    historyCursor--;
    renderHistoryQuestion(answeredHistory[historyCursor]);
  } else if (historyCursor === 0) {
    window.resumeActiveDrill();
  }
};

window.resumeActiveDrill = function() {
  historyCursor = -1;
  loadNextArenaQuestion(true);
};

// ============================================================================
// QUIZ ARENA (QUESTION DISPLAY & SUBMISSION)
// ============================================================================
function loadNextArenaQuestion() {
  isCurrentQuestionAnswered = false;
  historyCursor = -1;
  updateHistoryNavUI();
  const croqInput = document.getElementById('arena-croq-input');
  if (croqInput) {
    croqInput.disabled = false;
  }

  currentQuestion = queueEngine.getCurrentQuestion();
  selectedOptionIds.clear();
  isEvaluating = false;

  // Start question timer for study tracking
  if (currentQuestion) {
    studyTracker.startQuestionTimer();
  }

  // Reset & update AI chat context for the new question
  arenaChatHistory = [];
  updateArenaChatContext();
  const chatboxEl = document.getElementById('arena-ai-chatbox');
  if (chatboxEl && chatboxEl.style.display !== 'none') {
    renderChatWelcome();
  }

  // Hide success banner & explanation boxes, remove highlights, show default actions
  document.getElementById('arena-success-banner').style.display = 'none';
  const arenaExpBox = document.getElementById('arena-explanation-box');
  if (arenaExpBox) arenaExpBox.style.display = 'none';
  const arenaAiBox = document.getElementById('arena-ai-explanation-box');
  if (arenaAiBox) arenaAiBox.style.display = 'none';
  document.querySelectorAll('.option-item').forEach(el => el.classList.remove('correct-highlight', 'wrong-highlight'));
  document.getElementById('arena-default-actions').style.display = 'flex';

  if (!currentQuestion) {
    // All questions cleaned!
    showVictoryScreen();
    return;
  }

  const stats = queueEngine.getQuestionStats(currentQuestion.uid);

  // Chapter badge (blurred by default until clicked)
  const chapterBadge = document.getElementById('arena-chapter-title');
  if (chapterBadge) {
    chapterBadge.classList.add('is-blurred');
    chapterBadge.classList.remove('is-revealed');
    chapterBadge.title = 'Chapitre masqué (Cliquer pour afficher)';
    const dateStr = extractQuestionDateOrSession(currentQuestion);
    const dateBadgeHtml = dateStr ? `<span class="question-date-pill" title="Date ou session du QCM : ${escapeHtml(dateStr)}"><i data-lucide="calendar" style="width:11px;height:11px;"></i> ${escapeHtml(dateStr)}</span>` : '';
    chapterBadge.innerHTML = `
      <span class="chapter-title-text">Pédiatrie — ${escapeHtml(currentQuestion.chapterTitle || 'Général')}${dateBadgeHtml ? ' ' + dateBadgeHtml : ''}</span>
      <span class="chapter-title-hint"><i data-lucide="eye" style="width:11px;height:11px;"></i> Cours masqué</span>
    `;
    chapterBadge.onclick = () => window.toggleArenaChapterTitle();
  }
  
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
    clinicalText.innerHTML = formatMedicalContent(currentQuestion.clinical_case.trim());
    clinicalBox.style.display = 'block';
  } else {
    clinicalBox.style.display = 'none';
  }

  // Question Statement
  document.getElementById('arena-question-text').innerHTML = formatMedicalContent(currentQuestion.question || currentQuestion.statement);

  // Media preview (retracted & blurred by default)
  const mediaWrap = document.getElementById('arena-media-wrap');
  if (currentQuestion.media_urls && currentQuestion.media_urls.length > 0) {
    mediaWrap.innerHTML = renderQuestionMedia(currentQuestion.media_urls);
    mediaWrap.style.display = 'block';
    refreshLucide();
  } else {
    mediaWrap.innerHTML = '';
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

    renderOptionsList(currentQuestion.options || []);
  }

  refreshLucide();
}

function renderOptionsList(options) {
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
      toggleOptionSelection(item);
    });

    container.appendChild(item);
  });
}

function toggleOptionSelection(itemElement) {
  const optId = itemElement.dataset.optId;

  // Multi-choice selection enabled for all questions (A, B, C...)
  if (selectedOptionIds.has(optId)) {
    selectedOptionIds.delete(optId);
    itemElement.classList.remove('selected');
  } else {
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
    toggleOptionSelection(options[index]);
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
// SUCCESS HANDLER WITH LIVE EXPLANATION
// ============================================================================
function handleAnswerSuccess(score = null, feedback = null, customLetters = null) {
  let letters = customLetters;
  if (!letters) {
    if (currentQuestion && currentQuestion.is_croq) {
      const croqVal = document.getElementById('arena-croq-input')?.value?.trim();
      letters = croqVal ? [croqVal] : [];
    } else {
      letters = Array.from(document.querySelectorAll('.option-item.selected')).map(el => el.dataset.letter).sort();
    }
  }

  // Enregistrer dans l'historique de consultation (max 5)
  pushToAnsweredHistory(currentQuestion, letters, true, score);

  const result = queueEngine.handleSuccess(currentQuestion.uid);
  queueEngine.incrementTodayCount();
  studyTracker.recordAnswer(true, currentQuestion ? currentQuestion.chapterId : null, currentQuestion ? currentQuestion.uid : null);
  updateArenaDailyBadge();
  if (currentView === 'stats') renderStatsUI();
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
  } else if (result.isPenultimate) {
    const scoreText = score ? ` (Score : ${score}%)` : '';
    bannerText.innerHTML = `<strong>Dernier palier avant élimination ! 🎯</strong> Validée ${result.newCurrent}/${result.target} fois. Placée parmi les 50% dernières questions restantes (+${result.pushDistance} cartes).`;
  } else {
    const scoreText = score ? ` (Score : ${score}%)` : '';
    bannerText.innerHTML = `<strong>Bonne réponse${scoreText} !</strong> Validée ${result.newCurrent}/${result.target} fois. Repoussée de ${result.pushDistance} cartes.`;
  }

  banner.style.display = 'flex';

  // Highlight correct options visually in arena
  if (currentQuestion && currentQuestion.options) {
    document.querySelectorAll('.option-item').forEach(el => {
      const letter = el.dataset.letter;
      const isCor = (currentQuestion.options || []).some(o => o.letter === letter && o.is_correct);
      if (isCor) {
        el.classList.add('correct-highlight');
      }
    });
  }

  // Live Official Explanation Box right in the Arena (displayed for both right & wrong answers)
  const expBox = document.getElementById('arena-explanation-box');
  const expText = document.getElementById('arena-explanation-text');
  if (expBox && expText) {
    if (currentQuestion.explanation && currentQuestion.explanation.trim()) {
      expText.innerHTML = formatMedicalContent(currentQuestion.explanation.trim());
      expBox.style.display = 'flex';
    } else {
      expText.innerHTML = `<em>Réponse officielle validée conformément aux critères du cours <strong>${escapeHtml(currentQuestion.chapterTitle || 'Pédiatrie')}</strong>.</em>`;
      expBox.style.display = 'flex';
    }
  }

  // Live AI explanation box in Arena
  renderArenaAiExplanation(currentQuestion);

  isCurrentQuestionAnswered = true;
  window.toggleArenaChapterTitle(true);
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
  // Capture target question and UID immediately to avoid race conditions when user skips modal
  const targetQuestion = currentQuestion;
  if (!targetQuestion) return;
  const targetUid = targetQuestion.uid;

  // Enregistrer dans l'historique de consultation (max 5)
  pushToAnsweredHistory(targetQuestion, userAnswerLetters, false, score);

  const result = queueEngine.handleFailure(targetUid);
  studyTracker.recordAnswer(false, targetQuestion.chapterId || null, targetUid);
  // Seules les réponses justes incrémentent le compteur journalier de QCM
  updateArenaDailyBadge();
  if (currentView === 'stats') renderStatsUI();
  firebaseSyncService.triggerAutoPush();
  isCurrentQuestionAnswered = true;
  window.toggleArenaChapterTitle(true);

  // Populate penalty header
  let penaltyTitle = '';
  let penaltyDesc = '';

  if (result.newTarget >= 10) {
    if (result.decremented) {
      penaltyTitle = `Plafond de 10 atteint : progression diminuée (${result.previousCurrent}/10 ➔ ${result.current}/10)`;
      penaltyDesc = `Cette question a été ratée (${result.mistakes} faute${result.mistakes > 1 ? 's' : ''}). Le seuil étant plafonné à 10, votre progression diminue de ${result.previousCurrent}/10 à ${result.current}/10. Elle réapparaîtra dans ${result.pushDistance} cartes.`;
    } else {
      penaltyTitle = `Pénalité maximale : seuil plafonné à 10 réussites requises`;
      penaltyDesc = `Cette question a été ratée (${result.mistakes} faute${result.mistakes > 1 ? 's' : ''}). Progression actuelle : ${result.current}/10. Elle réapparaîtra dans ${result.pushDistance} cartes pour ancrer le bon réflexe.`;
    }
  } else {
    penaltyTitle = `Pénalité appliquée : seuil augmenté à ${result.newTarget} réussites requises`;
    penaltyDesc = `Cette question a été ratée (${result.mistakes} faute${result.mistakes > 1 ? 's' : ''}). Progression actuelle : ${result.current}/${result.newTarget}. Elle réapparaîtra dans ${result.pushDistance} cartes pour ancrer le bon réflexe.`;
  }

  document.getElementById('error-modal-penalty-title').textContent = penaltyTitle;
  document.getElementById('error-modal-penalty-desc').textContent = penaltyDesc;

  // Render structured comparison in error modal with full question statement, all choices A-E, my choice, and correct choice!
  const userText = isCroq ? (userAnswerLetters[0] || '') : (userAnswerLetters.join(', ') || 'Aucune réponse cochée');
  const comparisonContainer = document.getElementById('error-modal-comparison-container') 
    || document.querySelector('.answer-recap-box');

  if (comparisonContainer) {
    const recapHtml = formatQuestionMistakeRecap(targetQuestion, userAnswerLetters, isCroq, userText, score);
    comparisonContainer.outerHTML = `<div id="error-modal-comparison-container">${recapHtml}</div>`;
  }

  // Highlight options visually in Arena (red for wrong choices, green for correct)
  if (targetQuestion && targetQuestion.options) {
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

  // Show modal immediately linked to targetUid
  modals.error.dataset.questionUid = targetUid;
  modals.error.style.display = 'flex';
  const aiNoteContainer = document.getElementById('error-modal-ai-note');
  aiNoteContainer.innerHTML = `
    <div class="reasoning-loader-wrap">
      <i data-lucide="sparkles" class="spin"></i>
      <span>Consultation de l'IA Flash et formulation de la démarche clinique complète...</span>
    </div>
  `;
  refreshLucide();

  // Request AI reasoning note asynchronously using targetQuestion
  const reasoningObj = await geminiService.generateReasoningNote(
    targetQuestion,
    userAnswerLetters,
    isCroq,
    userAnswerLetters[0] || ''
  );

  saveAiExplanationForQuestion(targetUid, reasoningObj.note, reasoningObj.modelUsed, targetQuestion);

  // ONLY update modal if still visible AND still representing targetUid
  if (modals.error.style.display === 'flex' && modals.error.dataset.questionUid === targetUid) {
    aiNoteContainer.innerHTML = formatReasoningNote(reasoningObj.note);
    document.getElementById('error-modal-model-tag').textContent = reasoningObj.modelUsed;
    refreshLucide();
  }

  // Save to Notebook with targetQuestion metadata
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
// CARNET DE RAISONNEMENT IA (Groupé par Cours & Question Unique, Tris Multi-Critères)
// ============================================================================
let notebookSelectedChapter = '';
let notebookSortBy = 'date'; // 'date' | 'mistakes' | 'chapter' | 'score'
let notebookSortOrder = 'desc'; // 'desc' | 'asc'
let notebookViewMode = 'chapter'; // 'chapter' | 'flat'

function compareQuestions(qA, qB, sortBy, sortOrder) {
  let valA, valB;

  if (sortBy === 'date') {
    valA = qA.latestTimestamp || 0;
    valB = qB.latestTimestamp || 0;
  } else if (sortBy === 'mistakes') {
    valA = qA.totalMistakes || 0;
    valB = qB.totalMistakes || 0;
    // Tie-breaker: most recent date
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
  } else {
    return valA < valB ? 1 : (valA > valB ? -1 : 0);
  }
}

function getSortSummaryLabel() {
  const dirText = notebookSortOrder === 'desc' ? 'Décroissant ⬇' : 'Croissant ⬆';
  let critText = 'Date de faute';
  if (notebookSortBy === 'mistakes') critText = "Nombre d'erreurs";
  else if (notebookSortBy === 'chapter') critText = 'Ordre alphabétique des cours';
  else if (notebookSortBy === 'score') critText = 'Score CROQ';
  return `${critText} (${dirText})`;
}

function updateSortOrderButtonUI() {
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
  refreshLucide();
}

function renderQuestionCard(q, gIdx, qIdx, rankNumber = null) {
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

  // Pre-rendered panels for each attempt with complete fiches
  const panelsHtml = q.attempts.map((att, attIdx) => {
    const fullQ = allQuestions.find(item => item.uid === att.questionUid) || {
      uid: att.questionUid,
      question: att.questionText,
      clinical_case: att.clinicalCase || null,
      chapterTitle: att.chapterTitle || q.chapterTitle,
      options: att.options || [],
      explanation: att.officialExplanation || '',
      croq_answer: att.correctAnswer || ''
    };
    if (!fullQ.media_urls && att.media_urls) { fullQ.media_urls = att.media_urls; }
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

function groupNotesByChapterAndQuestion(notes) {
  const chapterMap = new Map();

  notes.forEach(note => {
    const fullQ = allQuestions.find(item => item.uid === note.questionUid);
    const chap = (fullQ && fullQ.chapterTitle) || (note.chapterTitle && note.chapterTitle.trim()) || "Pédiatrie Générale";
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
  const chapterKeys = Array.from(chapterMap.keys());

  for (const chapTitle of chapterKeys) {
    const qMap = chapterMap.get(chapTitle);
    const questions = [];

    for (const [qKey, attempts] of qMap.entries()) {
      // Sort attempts: newest first inside the question
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
        totalMistakes: totalMistakes,
        latestTimestamp: latestTimestamp,
        latestScore: latestScore,
        attempts: attempts
      });
    }

    // Sort questions within this chapter according to active criteria
    questions.sort((a, b) => compareQuestions(a, b, notebookSortBy, notebookSortOrder));

    const chapterLatestTimestamp = Math.max(...questions.map(q => q.latestTimestamp || 0), 0);
    const chapterTotalMistakes = questions.reduce((sum, q) => sum + q.totalMistakes, 0);

    result.push({
      chapterTitle: chapTitle,
      totalQuestions: questions.length,
      totalNotes: questions.reduce((sum, q) => sum + q.attemptsCount, 0),
      chapterLatestTimestamp: chapterLatestTimestamp,
      chapterTotalMistakes: chapterTotalMistakes,
      questions: questions
    });
  }

  // Sort chapters themselves according to the active criteria
  result.sort((cA, cB) => {
    if (notebookSortBy === 'date') {
      return notebookSortOrder === 'asc'
        ? cA.chapterLatestTimestamp - cB.chapterLatestTimestamp
        : cB.chapterLatestTimestamp - cA.chapterLatestTimestamp;
    } else if (notebookSortBy === 'mistakes') {
      return notebookSortOrder === 'asc'
        ? cA.chapterTotalMistakes - cB.chapterTotalMistakes
        : cB.chapterTotalMistakes - cA.chapterTotalMistakes;
    } else if (notebookSortBy === 'chapter') {
      const cmp = cA.chapterTitle.localeCompare(cB.chapterTitle, 'fr');
      return notebookSortOrder === 'asc' ? cmp : -cmp;
    } else if (notebookSortBy === 'score') {
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

  allGroups.forEach(g => {
    if (shouldCollapse) {
      g.classList.add('collapsed');
    } else {
      g.classList.remove('collapsed');
    }
  });

  allCards.forEach(c => {
    if (shouldCollapse) {
      c.classList.add('collapsed');
    } else {
      c.classList.remove('collapsed');
    }
  });

  const btnText = document.getElementById('btn-toggle-all-chapters-text');
  if (btnText) {
    btnText.textContent = shouldCollapse ? 'Tout déplier' : 'Tout replier';
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

  // Sync sort controls
  const sortSelect = document.getElementById('notebook-sort-by');
  if (sortSelect && sortSelect.value !== notebookSortBy) {
    sortSelect.value = notebookSortBy;
  }
  updateSortOrderButtonUI();

  // Filter notes by text & chapter
  const filtered = allNotes.filter(n => {
    if (notebookSelectedChapter && (n.chapterTitle || 'Pédiatrie Générale') !== notebookSelectedChapter) {
      return false;
    }
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    const fullQ = allQuestions.find(item => item.uid === n.questionUid);
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
        <strong>${totalQuestions}</strong> question${totalQuestions > 1 ? 's' : ''} (${totalNotes} analyse${totalNotes > 1 ? 's' : ''}) • Tri : <strong class="text-cyan">${getSortSummaryLabel()}</strong>
      </span>
      <button class="notebook-toggle-all-btn" onclick="window.toggleAllChapters()" title="Tout replier ou tout déplier">
        <i data-lucide="chevrons-up-down" style="width:14px;height:14px;"></i>
        <span id="btn-toggle-all-chapters-text">Tout replier</span>
      </button>
    `;
  }

  container.innerHTML = '';

  if (notebookViewMode === 'flat') {
    // FLAT LIST VIEW: All questions sorted across the whole syllabus
    const allFlatQuestions = [];
    groupedChapters.forEach(g => {
      allFlatQuestions.push(...g.questions);
    });
    allFlatQuestions.sort((a, b) => compareQuestions(a, b, notebookSortBy, notebookSortOrder));

    allFlatQuestions.forEach((q, qIdx) => {
      const cardHtml = renderQuestionCard(q, 'flat', qIdx, qIdx + 1);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = cardHtml;
      container.appendChild(tempDiv.firstElementChild);
    });
  } else {
    // CHAPTER ACCORDION VIEW
    groupedChapters.forEach((g, gIdx) => {
      const chapterGroupId = `chap_group_${gIdx}`;
      const chapterGroupEl = document.createElement('div');
      chapterGroupEl.className = 'notebook-chapter-group';
      chapterGroupEl.id = chapterGroupId;

      let questionsHtml = '';
      g.questions.forEach((q, qIdx) => {
        questionsHtml += renderQuestionCard(q, gIdx, qIdx, null);
      });

      const mistakesCountBadge = g.chapterTotalMistakes > 0 ? `
        <span class="chapter-count-badge" style="background:rgba(239, 68, 68, 0.2);color:#fca5a5;border-color:rgba(239,68,68,0.4);" title="Total des fautes dans ce cours">
          ⚠️ ${g.chapterTotalMistakes} faute${g.chapterTotalMistakes > 1 ? 's' : ''}
        </span>
      ` : '';

      chapterGroupEl.innerHTML = `
        <div class="notebook-chapter-header" onclick="window.toggleChapterGroup('${chapterGroupId}')">
          <div class="notebook-chapter-title-wrap">
            <i data-lucide="folder-open" class="chapter-folder-icon"></i>
            <span class="notebook-chapter-title">${escapeHtml(g.chapterTitle)}</span>
            <span class="chapter-count-badge">${g.totalQuestions} question${g.totalQuestions > 1 ? 's' : ''}</span>
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
    });
  }

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

  queueEngine.selectedChaptersUpdatedAt = Date.now();
  queueEngine.initSession(selected);
  modals.chapters.style.display = 'none';
  updateDashboardUI();
  firebaseSyncService.triggerAutoPush();
}

// ============================================================================
// STUDY PROGRESS & ANALYTICS INFOGRAPHIC ENGINE
// ============================================================================
let currentStatsRange = 'today'; // 'today' | '7' | '30' | 'all' | 'custom' (Aujourd'hui par défaut)
let customStatsStart = '';
let customStatsEnd = '';
let selectedDayOffset = 0; // 0 = Aujourd'hui, -1 = Hier, -2 = Avant-hier, etc.
let courseTrackerMode = 'period'; // 'period' | 'global'
let courseTrackerSearchQuery = '';
let lastRenderedChapterTotals = {};
let lastRenderedPeriodLabel = '';

function getDateStrWithOffset(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDayLabelForOffset(offsetDays = 0) {
  if (offsetDays === 0) return "Aujourd'hui";
  if (offsetDays === -1) return "Hier";
  if (offsetDays === -2) return "Avant-hier";
  const dateStr = getDateStrWithOffset(offsetDays);
  return formatDateFr(dateStr);
}

function formatDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '0m';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes > 0 ? minutes + 'm' : ''}`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds > 0 ? seconds + 's' : ''}`;
  }
  return `${seconds}s`;
}

function formatDateFr(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const options = { weekday: 'short', day: 'numeric', month: 'short' };
  return d.toLocaleDateString('fr-FR', options);
}

function renderStatsUI() {
  const todayStr = studyTracker.getTodayDateStr();
  const todayRecord = studyTracker.getOrCreateDayRecord(todayStr);

  let rangeDays;
  let rangeLabel = "Aujourd'hui";
  if (currentStatsRange === 'today') {
    const targetDateStr = getDateStrWithOffset(selectedDayOffset);
    const targetRecord = studyTracker.getOrCreateDayRecord(targetDateStr);
    rangeDays = [targetRecord];
    rangeLabel = getDayLabelForOffset(selectedDayOffset);
  } else if (currentStatsRange === 'custom') {
    const start = customStatsStart || document.getElementById('custom-date-start')?.value || todayStr;
    const end = customStatsEnd || document.getElementById('custom-date-end')?.value || todayStr;
    rangeDays = studyTracker.getDaysByCustomRange(start, end);
    rangeLabel = `${formatDateFr(start)} ➔ ${formatDateFr(end)}`;
  } else if (currentStatsRange === 'all') {
    rangeDays = studyTracker.getDaysByRange('all');
    rangeLabel = "Tout l'historique";
  } else if (currentStatsRange === '30') {
    rangeDays = studyTracker.getDaysByRange('30');
    rangeLabel = '30 jours';
  } else if (currentStatsRange === '7') {
    rangeDays = studyTracker.getDaysByRange('7');
    rangeLabel = '7 jours';
  } else {
    // Par défaut : Aujourd'hui (ou décalage sélectionné)
    const targetDateStr = getDateStrWithOffset(selectedDayOffset);
    const targetRecord = studyTracker.getOrCreateDayRecord(targetDateStr);
    rangeDays = [targetRecord];
    rangeLabel = getDayLabelForOffset(selectedDayOffset);
  }

  // Update Day Stepper UI elements
  const dayTextEl = document.getElementById('range-day-text');
  if (dayTextEl) {
    dayTextEl.textContent = (currentStatsRange === 'today') ? rangeLabel : "Aujourd'hui";
  }
  const nextDayBtn = document.getElementById('btn-stats-next-day');
  if (nextDayBtn) {
    nextDayBtn.disabled = (selectedDayOffset >= 0);
  }

  // Synchroniser la classe active sur tous les boutons de période du sélecteur
  const rangeToggleEl = document.getElementById('stats-range-toggle');
  if (rangeToggleEl) {
    rangeToggleEl.querySelectorAll('.range-btn').forEach(btn => {
      const r = btn.dataset.range;
      if (r === currentStatsRange) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // Calculate statistics strictly for the selected period
  const periodAnalytics = (currentStatsRange === 'all')
    ? studyTracker.getGlobalAnalytics()
    : studyTracker.getAnalyticsForDays(rangeDays);

  const streakMetrics = studyTracker.getStreakMetrics();

  // 1. Hero KPIs
  // Card 1: Streak (Série d'étude)
  const streakDaysEl = document.getElementById('kpi-streak-days');
  const streakSubEl = document.getElementById('kpi-streak-sub');
  if (streakDaysEl) streakDaysEl.textContent = streakMetrics.currentStreak;
  if (streakSubEl) {
    if (currentStatsRange === 'today') {
      const studiedToday = todayRecord.totalQuestions > 0;
      streakSubEl.textContent = studiedToday
        ? `Record : ${streakMetrics.maxStreak} j • ✓ Validé aujourd'hui`
        : `Record : ${streakMetrics.maxStreak} j • ⏳ En attente aujourd'hui`;
    } else {
      const activeText = `${periodAnalytics.totalDaysActive} jour${periodAnalytics.totalDaysActive > 1 ? 's' : ''} actif${periodAnalytics.totalDaysActive > 1 ? 's' : ''}`;
      streakSubEl.textContent = `Record : ${streakMetrics.maxStreak} j • ${activeText}`;
    }
  }

  // Card 2: Questions Faites (Période sélectionnée)
  const qLabelEl = document.getElementById('kpi-questions-label');
  const qTotalEl = document.getElementById('kpi-total-questions');
  const qSubEl = document.getElementById('kpi-questions-sub');
  if (qLabelEl) {
    if (currentStatsRange === 'today') qLabelEl.textContent = "Questions (Aujourd'hui)";
    else if (currentStatsRange === 'all') qLabelEl.textContent = "Total Questions Faites";
    else qLabelEl.textContent = `Questions (${rangeLabel})`;
  }
  if (qTotalEl) qTotalEl.textContent = formatNumber(periodAnalytics.totalQuestions);
  if (qSubEl) {
    if (currentStatsRange === 'today') {
      qSubEl.textContent = `${periodAnalytics.totalCorrect} justes • ${periodAnalytics.totalWrong} fautes`;
    } else if (currentStatsRange === 'all') {
      qSubEl.textContent = `${todayRecord.totalQuestions} aujourd'hui • ${formatNumber(periodAnalytics.totalCorrect)} justes`;
    } else {
      qSubEl.textContent = `${formatNumber(periodAnalytics.totalCorrect)} justes • ${formatNumber(periodAnalytics.totalWrong)} fautes (${todayRecord.totalQuestions} auj.)`;
    }
  }

  // Card 3: Taux de Précision (Période sélectionnée)
  const accLabelEl = document.getElementById('kpi-accuracy-label');
  const accEl = document.getElementById('kpi-accuracy-pct');
  const accSubEl = document.getElementById('kpi-accuracy-sub');
  if (accLabelEl) {
    if (currentStatsRange === 'today') accLabelEl.textContent = "Précision (Aujourd'hui)";
    else if (currentStatsRange === 'all') accLabelEl.textContent = "Précision Globale";
    else accLabelEl.textContent = `Précision (${rangeLabel})`;
  }
  if (accEl) {
    accEl.textContent = periodAnalytics.totalQuestions > 0 ? `${periodAnalytics.accuracyPct}%` : '--%';
  }
  if (accSubEl) {
    if (periodAnalytics.totalQuestions > 0) {
      accSubEl.textContent = `${formatNumber(periodAnalytics.totalCorrect)} justes • ${formatNumber(periodAnalytics.totalWrong)} fautes`;
    } else {
      accSubEl.textContent = 'Aucun QCM sur la période';
    }
  }

  // Card 4: First Pass (Découverte) KPI Card (Période sélectionnée)
  const fpCardPct = document.getElementById('kpi-first-pass-pct');
  const fpCardSub = document.getElementById('kpi-first-pass-sub');
  const fpData = periodAnalytics.firstPass;

  if (fpCardPct) {
    fpCardPct.textContent = fpData.total > 0 ? `${fpData.pct}%` : '--%';
  }
  if (fpCardSub) {
    if (fpData.total > 0) {
      fpCardSub.textContent = (currentStatsRange === 'all')
        ? `${formatNumber(fpData.correct)}/${formatNumber(fpData.total)} découverts (global)`
        : `${formatNumber(fpData.correct)}/${formatNumber(fpData.total)} inédits sur période`;
    } else {
      fpCardSub.textContent = (currentStatsRange === 'all')
        ? '0 découverte'
        : '0 inédit (que des révisions)';
    }
  }

  // Card 5: Temps d'Étude (Période sélectionnée)
  const timeLabelEl = document.getElementById('kpi-time-label');
  const timeEl = document.getElementById('kpi-total-time');
  const sessSubEl = document.getElementById('kpi-sessions-sub');
  if (timeLabelEl) {
    if (currentStatsRange === 'today') timeLabelEl.textContent = "Temps (Aujourd'hui)";
    else if (currentStatsRange === 'all') timeLabelEl.textContent = "Temps Total d'Étude";
    else timeLabelEl.textContent = `Temps d'Étude (${rangeLabel})`;
  }
  if (timeEl) timeEl.textContent = formatDuration(periodAnalytics.totalTimeSeconds);
  if (sessSubEl) {
    sessSubEl.textContent = `${periodAnalytics.totalSessions} session${periodAnalytics.totalSessions > 1 ? 's' : ''} active${periodAnalytics.totalSessions > 1 ? 's' : ''}`;
  }

  // Card 6: Vitesse Moyenne (Période sélectionnée)
  const speedLabelEl = document.getElementById('kpi-speed-label');
  const speedEl = document.getElementById('kpi-avg-speed');
  const speedSubEl = document.getElementById('kpi-speed-sub');
  if (speedLabelEl) {
    if (currentStatsRange === 'today') speedLabelEl.textContent = "Vitesse (Aujourd'hui)";
    else if (currentStatsRange === 'all') speedLabelEl.textContent = "Vitesse Moyenne Globale";
    else speedLabelEl.textContent = `Vitesse Moyenne (${rangeLabel})`;
  }
  if (speedEl) {
    speedEl.textContent = (periodAnalytics.totalQuestions > 0 && periodAnalytics.avgTimePerQuestion > 0)
      ? periodAnalytics.avgTimePerQuestion
      : '--';
  }
  if (speedSubEl) {
    if (periodAnalytics.totalQuestions > 0) {
      const cTime = periodAnalytics.avgTimeCorrect > 0 ? `${periodAnalytics.avgTimeCorrect}s` : '--s';
      const wTime = periodAnalytics.avgTimeWrong > 0 ? `${periodAnalytics.avgTimeWrong}s` : '--s';
      speedSubEl.textContent = `Justes : ${cTime} • Fautes : ${wTime}`;
    } else {
      speedSubEl.textContent = `Justes : --s • Fautes : --s`;
    }
  }

  // Card 7: Temps Nécessaire pour Terminer
  // - Mode "Aujourd'hui" : Vitesse × Questions restantes aujourd'hui (s'actualise après chaque réponse)
  // - Autres modes (7j, 30j, Tout, Personnalisé) : Affiche le temps par jour et le temps total nécessaire
  const finishLabelEl = document.getElementById('kpi-finish-label');
  const finishValEl = document.getElementById('kpi-finish-value');
  const finishSubEl = document.getElementById('kpi-finish-sub');

  if (finishValEl) {
    const dashboardMetrics = queueEngine.getDashboardMetrics();
    const totalIterationsRemaining = dashboardMetrics.totalIterationsRequired;
    const countdown = getExamCountdownMetrics(totalIterationsRemaining);
    const todayTrackerObj = queueEngine.getTodayTracker();

    // Déterminer la vitesse de réponse de référence (en secondes/QCM)
    const globalAnalytics = studyTracker.getGlobalAnalytics();
    let speedSec = 0;
    if (periodAnalytics.totalQuestions > 0 && periodAnalytics.avgTimePerQuestion > 0) {
      speedSec = periodAnalytics.avgTimePerQuestion;
    } else if (globalAnalytics.totalQuestions > 0 && globalAnalytics.avgTimePerQuestion > 0) {
      speedSec = globalAnalytics.avgTimePerQuestion;
    } else {
      speedSec = 45; // Cadence par défaut si aucun QCM n'a encore été chronométré
    }
    speedSec = Math.round(speedSec * 10) / 10;

    if (currentStatsRange === 'today') {
      if (selectedDayOffset === 0) {
        const remainingToday = Math.max(0, countdown.dailyIterationsRequired - todayTrackerObj.count);
        const totalSecNeededToday = Math.round(remainingToday * speedSec);

        if (finishLabelEl) finishLabelEl.textContent = "Temps pour Finir (Auj.)";

        if (remainingToday === 0) {
          finishValEl.innerHTML = `<span style="color:var(--emerald);font-weight:700;">0 min</span> <small style="font-size:0.8rem;font-weight:600;color:var(--emerald);">✓ Terminé</small>`;
          if (finishSubEl) {
            finishSubEl.innerHTML = `<span style="color:var(--emerald);">✓ Objectif atteint (${todayTrackerObj.count}/${countdown.dailyIterationsRequired} QCM auj.)</span>`;
          }
        } else {
          finishValEl.innerHTML = `<span>${formatDuration(totalSecNeededToday)}</span>`;
          if (finishSubEl) {
            finishSubEl.textContent = `~${remainingToday} QCM restants auj. • ${speedSec}s/QCM`;
          }
        }
      } else {
        if (finishLabelEl) finishLabelEl.textContent = `Bilan du Jour (${rangeLabel})`;
        const dayTimeSec = periodAnalytics.totalTimeSeconds || 0;
        const dayQCount = periodAnalytics.totalQuestions || 0;
        finishValEl.innerHTML = `<span style="font-weight:700;">${formatDuration(dayTimeSec)}</span>`;
        if (finishSubEl) {
          finishSubEl.textContent = dayQCount > 0
            ? `${dayQCount} QCM réalisés ce jour-là (${periodAnalytics.totalCorrect} justes)`
            : "Aucun QCM enregistré ce jour-là";
        }
      }
    } else {
      const totalSecNeededOverall = Math.round(totalIterationsRemaining * speedSec);
      const dailySecNeededForExam = Math.round(countdown.dailyIterationsRequired * speedSec);

      const formattedTotalTime = formatDuration(totalSecNeededOverall);
      const formattedDailyTime = formatDuration(dailySecNeededForExam);

      if (finishLabelEl) {
        finishLabelEl.textContent = (currentStatsRange === 'all')
          ? "Temps Requis (Total & Jour)"
          : `Temps Requis (${rangeLabel})`;
      }

      if (totalIterationsRemaining === 0) {
        finishValEl.innerHTML = `<span style="color:var(--emerald);font-weight:700;">Programme Terminé ! 🎉</span>`;
        if (finishSubEl) {
          finishSubEl.textContent = "Toutes les questions maîtrisées (100%)";
        }
      } else {
        finishValEl.innerHTML = `<span style="font-weight:700;">${formattedDailyTime}</span><small style="font-size:0.8rem;font-weight:600;color:var(--text-muted);">/j</small> • <span style="font-weight:700;">${formattedTotalTime}</span><small style="font-size:0.8rem;font-weight:600;color:var(--text-muted);"> total</small>`;
        if (finishSubEl) {
          finishSubEl.textContent = `Total : ${formattedTotalTime} (${formatNumber(totalIterationsRemaining)} QCM • J-${countdown.daysLeft})`;
        }
      }
    }
  }

  // 2. Heatmap
  renderStatsHeatmap(studyTracker.getRawHistory());

  // 3. Activity Chart (Stacked Bars & Velocity curve)
  renderStatsActivityChart(rangeDays);

  // 4. Velocity breakdown & Exam projection
  renderStatsVelocityAndProjection(periodAnalytics, rangeLabel);

  // 5. Chapters breakdown
  lastRenderedChapterTotals = periodAnalytics.chapterTotals || {};
  lastRenderedPeriodLabel = rangeLabel;
  renderStatsChapters(lastRenderedChapterTotals, lastRenderedPeriodLabel);

  // 6. Daily Timeline
  renderStatsTimeline(rangeDays);

  // 7. Lesson Stopwatch & Study Time per Lesson
  renderLessonTrackerUI();

  // Ensure active subpage visibility
  switchStatsSubpage(currentStatsSubpage, false);

  refreshLucide();
}

/**
 * Renders GitHub-style activity contribution heatmap for last 60 days
 */
function renderStatsHeatmap(history) {
  const container = document.getElementById('stats-heatmap-container');
  if (!container) return;

  const now = new Date();
  const daysCount = 63; // 9 full weeks of 7 days
  const cellWidth = 14;
  const cellHeight = 14;
  const gap = 4;
  const leftMargin = 34;
  const topMargin = 22;

  const width = leftMargin + (9 * (cellWidth + gap)) + 10;
  const height = topMargin + (7 * (cellHeight + gap)) + 6;

  // Build 63 days list ending today
  const daysList = [];
  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const dayData = history[dateStr] || null;
    const dayOfWeek = (d.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
    daysList.push({ dateStr, dayData, dateObj: d, dayOfWeek });
  }

  let svgContent = `<svg class="heatmap-svg" viewBox="0 0 ${width} ${height}" style="max-width:100%;height:auto;">`;

  // Day of week labels on left
  const dayNames = ['Lun', '', 'Mer', '', 'Ven', '', 'Dim'];
  dayNames.forEach((name, idx) => {
    if (name) {
      const y = topMargin + idx * (cellHeight + gap) + 11;
      svgContent += `<text x="4" y="${y}" fill="#64748b" font-size="9" font-family="var(--font-body)">${name}</text>`;
    }
  });

  // Cells grouped by weeks
  for (let col = 0; col < 9; col++) {
    for (let row = 0; row < 7; row++) {
      const itemIndex = col * 7 + row;
      const item = daysList[itemIndex];
      if (!item) continue;

      const x = leftMargin + col * (cellWidth + gap);
      const y = topMargin + row * (cellHeight + gap);

      const total = item.dayData ? (item.dayData.totalQuestions || 0) : 0;
      const correct = item.dayData ? (item.dayData.correctAnswers || 0) : 0;
      const wrong = item.dayData ? (item.dayData.wrongAnswers || 0) : 0;
      const timeSec = item.dayData ? (item.dayData.totalTimeSeconds || 0) : 0;

      let color = '#121d33';
      let stroke = 'rgba(255,255,255,0.06)';
      if (total >= 80) { color = '#00d4ff'; stroke = 'none'; }
      else if (total >= 40) { color = '#10b981'; stroke = 'none'; }
      else if (total >= 15) { color = '#047857'; stroke = 'none'; }
      else if (total >= 1) { color = '#064e3b'; stroke = 'none'; }

      const dateLabel = item.dateObj.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
      const tooltipText = total > 0
        ? `${dateLabel} : ${total} QCM (${correct} justes, ${wrong} fautes, ${formatDuration(timeSec)})`
        : `${dateLabel} : Aucun entraînement`;

      svgContent += `
        <rect class="heatmap-day-cell" x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" rx="3" ry="3"
              fill="${color}" stroke="${stroke}" stroke-width="1">
          <title>${escapeHtml(tooltipText)}</title>
        </rect>
      `;
    }
  }

  svgContent += '</svg>';
  container.innerHTML = svgContent;
}

/**
 * Renders combined SVG activity chart (Stacked bars for Justes vs Fautes + Polyline for velocity)
 */
function renderStatsActivityChart(rangeDays) {
  const container = document.getElementById('stats-activity-chart');
  if (!container) return;

  const totalRange = rangeDays.length;
  const chartTitleEl = document.getElementById('activity-chart-title');
  if (chartTitleEl) {
    if (currentStatsRange === 'today') {
      chartTitleEl.textContent = "Activité d'Aujourd'hui (Bilan de la journée)";
    } else if (currentStatsRange === 'custom') {
      const firstStr = rangeDays[0]?.dateStr ? formatDateFr(rangeDays[0].dateStr) : '';
      const lastStr = rangeDays[rangeDays.length - 1]?.dateStr ? formatDateFr(rangeDays[rangeDays.length - 1].dateStr) : '';
      chartTitleEl.textContent = `Activité Personnalisée (${firstStr} ➔ ${lastStr})`;
    } else if (totalRange <= 7) {
      chartTitleEl.textContent = 'Activité des 7 derniers jours (Volume, Justes vs Fautes & Vélocité)';
    } else if (totalRange <= 30) {
      chartTitleEl.textContent = 'Activité des 30 derniers jours';
    } else {
      chartTitleEl.textContent = "Historique complet d'activité";
    }
  }

  if (rangeDays.length === 0) {
    container.innerHTML = '<div class="stats-empty-state"><p>Aucune donnée d\'entraînement sur cette période.</p></div>';
    return;
  }

  const svgWidth = 840;
  const svgHeight = 250;
  const padLeft = 46;
  const padRight = 50;
  const padTop = 30;
  const padBottom = 42;

  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const maxQ = Math.max(10, ...rangeDays.map(d => d.totalQuestions || 0));
  const maxVel = Math.max(60, ...rangeDays.map(d => d.avgTimePerQuestion || 0));

  let svg = `<svg class="chart-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="none">`;

  // Background Grid Lines (Horizontal)
  const gridSteps = 4;
  for (let s = 0; s <= gridSteps; s++) {
    const yVal = padTop + (plotH / gridSteps) * s;
    const qValue = Math.round(maxQ - (maxQ / gridSteps) * s);
    const velValue = Math.round(maxVel - (maxVel / gridSteps) * s);

    svg += `<line x1="${padLeft}" y1="${yVal}" x2="${svgWidth - padRight}" y2="${yVal}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" />`;
    // Left axis label (volume)
    svg += `<text x="${padLeft - 8}" y="${yVal + 4}" fill="#64748b" font-size="9" text-anchor="end" font-family="var(--font-body)">${qValue}</text>`;
    // Right axis label (velocity in seconds)
    if (s < gridSteps) {
      svg += `<text x="${svgWidth - padRight + 8}" y="${yVal + 4}" fill="#f59e0b" font-size="9" text-anchor="start" font-family="var(--font-body)">${velValue}s</text>`;
    }
  }

  const N = rangeDays.length;
  const colWidth = plotW / N;
  const barWidth = Math.max(6, Math.min(36, colWidth * 0.65));
  const velocityPoints = [];

  // Draw Bars
  rangeDays.forEach((d, i) => {
    const xCenter = padLeft + (i + 0.5) * colWidth;
    const xBar = xCenter - barWidth / 2;

    const total = d.totalQuestions || 0;
    const cor = d.correctAnswers || 0;
    const wr = d.wrongAnswers || 0;
    const speed = d.avgTimePerQuestion || 0;

    const hTotal = (total / maxQ) * plotH;
    const hCor = (cor / maxQ) * plotH;
    const hWr = (wr / maxQ) * plotH;

    const yCor = padTop + plotH - hCor;
    const yWr = yCor - hWr;

    const tooltip = `${formatDateFr(d.dateStr)} : ${total} QCM (${cor} justes, ${wr} fautes) • Vitesse : ${speed || '--'}s/QCM`;

    if (total > 0) {
      // Correct bar (bottom emerald)
      if (cor > 0) {
        svg += `
          <rect class="chart-bar-rect" x="${xBar}" y="${yCor}" width="${barWidth}" height="${Math.max(2, hCor)}" rx="2" fill="var(--emerald)">
            <title>${escapeHtml(tooltip)}</title>
          </rect>
        `;
      }
      // Wrong bar (top rose)
      if (wr > 0) {
        svg += `
          <rect class="chart-bar-rect" x="${xBar}" y="${yWr}" width="${barWidth}" height="${Math.max(2, hWr)}" rx="2" fill="var(--rose)">
            <title>${escapeHtml(tooltip)}</title>
          </rect>
        `;
      }
    } else {
      // Empty day placeholder bar
      svg += `
        <rect x="${xBar}" y="${padTop + plotH - 3}" width="${barWidth}" height="3" rx="1" fill="rgba(255,255,255,0.06)">
          <title>${escapeHtml(formatDateFr(d.dateStr))} : Aucun entraînement</title>
        </rect>
      `;
    }

    // Velocity point calculation
    if (speed > 0) {
      const yVel = padTop + plotH - (speed / maxVel) * plotH;
      velocityPoints.push({ x: xCenter, y: yVel, speed, dateStr: d.dateStr });
    }

    // X-axis date labels (show filtered according to range size)
    const shouldShowLabel = (N <= 10) || (N <= 31 && i % 3 === 0) || (i === N - 1);
    if (shouldShowLabel) {
      const labelText = d.dateStr ? d.dateStr.slice(5).replace('-', '/') : '';
      svg += `<text x="${xCenter}" y="${svgHeight - padBottom + 16}" fill="#8ca2c4" font-size="9" text-anchor="middle" font-family="var(--font-body)">${labelText}</text>`;
    }
  });

  // Draw Velocity curve (amber polyline)
  if (velocityPoints.length > 1) {
    const pointsStr = velocityPoints.map(p => `${p.x},${p.y}`).join(' ');
    svg += `<polyline points="${pointsStr}" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;
    velocityPoints.forEach(p => {
      svg += `
        <circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#f59e0b" stroke="#070b14" stroke-width="1.5">
          <title>${escapeHtml(formatDateFr(p.dateStr))} • Vitesse : ${p.speed} s/QCM</title>
        </circle>
      `;
    });
  } else if (velocityPoints.length === 1) {
    const p = velocityPoints[0];
    svg += `
      <circle cx="${p.x}" cy="${p.y}" r="4" fill="#f59e0b" stroke="#070b14" stroke-width="1.5">
        <title>${escapeHtml(formatDateFr(p.dateStr))} • Vitesse : ${p.speed} s/QCM</title>
      </circle>
    `;
  }

  svg += '</svg>';
  container.innerHTML = svg;
}

/**
 * Renders velocity metrics and adaptive countdown projection to November 10 exam
 */
function renderStatsVelocityAndProjection(analytics, periodLabel = '') {
  const velCorEl = document.getElementById('stat-vel-correct');
  const velWrEl = document.getElementById('stat-vel-wrong');
  const cadenceEl = document.getElementById('stat-cadence-observed');
  const projTextEl = document.getElementById('stat-exam-projection-text');

  if (velCorEl) velCorEl.textContent = analytics.avgTimeCorrect ? `${analytics.avgTimeCorrect} s` : '-- s';
  if (velWrEl) velWrEl.textContent = analytics.avgTimeWrong ? `${analytics.avgTimeWrong} s` : '-- s';

  const activeDays = Math.max(1, analytics.totalDaysActive);
  const observedCadence = Math.round(analytics.totalQuestions / activeDays);
  if (cadenceEl) {
    if (analytics.totalQuestions === 0) {
      cadenceEl.textContent = '0 QCM sur la période';
    } else if (currentStatsRange === 'today') {
      cadenceEl.textContent = `${analytics.totalQuestions} QCM aujourd'hui`;
    } else {
      cadenceEl.textContent = `${observedCadence} QCM / jour actif (${analytics.totalDaysActive} j)`;
    }
  }

  if (!projTextEl) return;

  const dashboardMetrics = queueEngine.getDashboardMetrics();
  const iterationsRemaining = dashboardMetrics.totalIterationsRequired;
  const countdown = getExamCountdownMetrics(iterationsRemaining);

  let effectiveCadence = observedCadence;
  let cadenceNote = `observée (${periodLabel || 'sur la période'})`;
  if (effectiveCadence === 0) {
    const globalA = studyTracker.getGlobalAnalytics();
    if (globalA.totalQuestions > 0) {
      effectiveCadence = Math.round(globalA.totalQuestions / Math.max(1, globalA.totalDaysActive));
      cadenceNote = 'globale historique';
    }
  }

  if (effectiveCadence > 0) {
    const daysNeeded = Math.ceil(iterationsRemaining / effectiveCadence);
    const estDate = new Date();
    estDate.setDate(estDate.getDate() + daysNeeded);
    const estDateStr = estDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

    if (daysNeeded <= countdown.daysLeft) {
      projTextEl.innerHTML = `<strong>🏆 Cadence excellente !</strong> Au rythme (${cadenceNote}) de <strong>${effectiveCadence} QCM/jour</strong>, vous aurez validé l'intégralité du programme en <strong>${daysNeeded} jours</strong> (vers le ${estDateStr}), soit avant l'échéance du concours (J-${countdown.daysLeft}) !`;
    } else {
      projTextEl.innerHTML = `<strong>⚠️ Recommandation Concours :</strong> Au rythme (${cadenceNote}) de ${effectiveCadence} QCM/j, il faudrait ${daysNeeded} jours pour tout nettoyer. Pour franchir la ligne d'arrivée avant le 10/11 (J-${countdown.daysLeft}), maintenez la cadence cible de <strong>${countdown.dailyIterationsRequired} QCM/jour</strong>.`;
    }
  } else {
    projTextEl.innerHTML = `<em>Répondez à vos premiers QCM pour activer la projection personnalisée vers l'examen du 10/11. Cadence cible recommandée : <strong>${countdown.dailyIterationsRequired} QCM/jour</strong>.</em>`;
  }
}

/**
 * Renders course questions tracker (both period activity and global progress across all 35 courses)
 */
function renderStatsChapters(chapterTotals = {}, periodLabel = '') {
  const container = document.getElementById('stats-chapters-breakdown');
  const badgeEl = document.getElementById('course-tracker-summary-badge');
  const titleEl = document.getElementById('course-tracker-title');
  if (!container) return;

  const query = (courseTrackerSearchQuery || '').trim().toLowerCase();

  if (courseTrackerMode === 'global') {
    if (titleEl) titleEl.textContent = 'Suivi Global : Questions par Cours';
    let totalMasteredAll = 0;
    let totalAttemptedAll = 0;

    let list = allChapters.map(ch => {
      const chQuestions = allQuestions.filter(q => q.chapterId === ch.id);
      const totalQ = chQuestions.length > 0 ? chQuestions.length : (ch.count || 0);

      let masteredCount = 0;
      let attemptedCount = 0;
      let totalMistakes = 0;

      chQuestions.forEach(q => {
        const st = queueEngine.stats[q.uid];
        if (st) {
          if (st.current >= st.target && st.target > 0) masteredCount++;
          if (st.current > 0 || st.mistakes > 0) attemptedCount++;
          totalMistakes += (st.mistakes || 0);
        }
      });

      totalMasteredAll += masteredCount;
      totalAttemptedAll += attemptedCount;

      const masteredPct = totalQ > 0 ? Math.round((masteredCount / totalQ) * 100) : 0;
      const attemptedPct = totalQ > 0 ? Math.round((attemptedCount / totalQ) * 100) : 0;

      return {
        id: ch.id,
        title: ch.title,
        totalQ,
        masteredCount,
        attemptedCount,
        untouchedCount: Math.max(0, totalQ - attemptedCount),
        inProgressCount: Math.max(0, attemptedCount - masteredCount),
        totalMistakes,
        masteredPct,
        attemptedPct
      };
    });

    if (query) {
      list = list.filter(item => item.title.toLowerCase().includes(query));
    }

    // Sort: highest mastered count or attempted count first, then name
    list.sort((a, b) => b.masteredCount - a.masteredCount || b.attemptedCount - a.attemptedCount || a.title.localeCompare(b.title));

    if (badgeEl) {
      badgeEl.textContent = `${list.length}/35 cours • ${totalMasteredAll}/${allQuestions.length} maîtrisés`;
    }

    if (list.length === 0) {
      container.innerHTML = `
        <div class="course-empty-period-box">
          <div class="empty-period-text">Aucun cours ne correspond à "${escapeHtml(courseTrackerSearchQuery)}".</div>
        </div>
      `;
      return;
    }

    let html = '';
    list.forEach(item => {
      const pctColor = item.masteredPct >= 75 ? 'var(--emerald)' : (item.masteredPct >= 30 ? 'var(--cyan)' : (item.masteredPct > 0 ? 'var(--amber)' : 'var(--text-muted)'));
      html += `
        <div class="chapter-stat-item course-tracking-card global-card">
          <div class="chapter-stat-header">
            <div class="course-card-title-group">
              <span class="chapter-stat-name" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
              <span class="course-global-ratio-tag">${item.masteredCount}/${item.totalQ} maîtrisés</span>
            </div>
            <div class="course-card-metrics-group">
              <span class="chapter-stat-pct" style="color:${pctColor}">
                ${item.masteredPct}%
              </span>
            </div>
          </div>
          <div class="chapter-progress-track-multi">
            <div class="track-segment-mastered" style="width:${item.masteredPct}%;" title="${item.masteredCount} maîtrisés"></div>
            <div class="track-segment-attempted" style="width:${Math.max(0, item.attemptedPct - item.masteredPct)}%;" title="${item.inProgressCount} en cours"></div>
          </div>
          <div class="course-tracking-sub">
            <span class="course-sub-detail text-emerald">🏆 ${item.masteredCount} acquis</span>
            <span class="course-sub-detail text-amber">🔄 ${item.inProgressCount} en cours</span>
            <span class="course-sub-detail text-muted">⚪ ${item.untouchedCount} restants</span>
            ${item.totalMistakes > 0 ? `<span class="course-sub-detail text-rose">⚠️ ${item.totalMistakes} faute${item.totalMistakes > 1 ? 's' : ''}</span>` : ''}
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  } else {
    // Mode period: only courses worked on in this period
    if (titleEl) titleEl.textContent = `Suivi des Questions (${periodLabel || 'Période'})`;
    const entries = Object.entries(chapterTotals).filter(([_, st]) => (st.correct + st.wrong) > 0);

    let list = entries.map(([chId, st]) => {
      const ch = allChapters.find(c => c.id === chId) || { title: chId, count: 0 };
      const chQuestions = allQuestions.filter(q => q.chapterId === chId);
      const totalInChapter = chQuestions.length > 0 ? chQuestions.length : (ch.count || 0);
      const totalDone = (st.correct || 0) + (st.wrong || 0);
      const pct = totalDone > 0 ? Math.round((st.correct / totalDone) * 100) : 0;
      const avgSpeed = (st.timeSeconds > 0 && totalDone > 0) ? Math.round((st.timeSeconds / totalDone) * 10) / 10 : 0;

      return {
        id: chId,
        title: ch.title,
        totalDone,
        correct: st.correct || 0,
        wrong: st.wrong || 0,
        pct,
        avgSpeed,
        totalInChapter
      };
    });

    if (query) {
      list = list.filter(item => item.title.toLowerCase().includes(query));
    }

    // Sort by total questions completed descending
    list.sort((a, b) => b.totalDone - a.totalDone || b.pct - a.pct);

    const totalQPeriod = list.reduce((sum, item) => sum + item.totalDone, 0);

    if (badgeEl) {
      badgeEl.textContent = `${list.length} cours • ${totalQPeriod} QCM faits`;
    }

    if (list.length === 0) {
      container.innerHTML = `
        <div class="course-empty-period-box">
          <div class="empty-period-icon"><i data-lucide="book-marked"></i></div>
          <div class="empty-period-title">Aucun QCM répondu sur cette période (${periodLabel})</div>
          <div class="empty-period-text">Consultez la progression globale de vos 35 cours de pédiatrie :</div>
          <button type="button" class="btn-switch-cmode-global" id="btn-trigger-global-mode">
            <i data-lucide="layers" style="width:14px;height:14px;"></i>
            <span>Voir le suivi global des 35 cours</span>
          </button>
        </div>
      `;
      const trigBtn = document.getElementById('btn-trigger-global-mode');
      if (trigBtn) {
        trigBtn.onclick = () => {
          courseTrackerMode = 'global';
          document.querySelectorAll('.course-pill-btn').forEach(b => b.classList.remove('active'));
          document.getElementById('btn-cmode-global')?.classList.add('active');
          renderStatsChapters(chapterTotals, periodLabel);
          refreshLucide();
        };
      }
      return;
    }

    let html = '';
    list.forEach(item => {
      let colorClass = 'var(--emerald)';
      if (item.pct < 50) colorClass = 'var(--rose)';
      else if (item.pct < 75) colorClass = 'var(--amber)';

      html += `
        <div class="chapter-stat-item course-tracking-card">
          <div class="chapter-stat-header">
            <div class="course-card-title-group">
              <span class="chapter-stat-name" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
              <span class="course-global-ratio-tag">${item.totalDone} QCM faits</span>
            </div>
            <div class="course-card-metrics-group">
              <span class="chapter-stat-pct" style="color:${colorClass}">${item.pct}%</span>
            </div>
          </div>
          <div class="chapter-progress-track">
            <div class="chapter-progress-fill" style="width: ${item.pct}%; background: ${colorClass};"></div>
          </div>
          <div class="course-tracking-sub">
            <span class="course-sub-detail text-emerald">✓ ${item.correct} justes</span>
            <span class="course-sub-detail text-rose">✗ ${item.wrong} fautes</span>
            ${item.avgSpeed > 0 ? `<span class="course-sub-detail text-cyan">⚡ ${item.avgSpeed}s/QCM</span>` : ''}
            <span class="course-sub-detail text-muted">(${item.totalInChapter} QCM au total dans ce cours)</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }
}

/**
 * Renders daily detailed history cards
 */
function renderStatsTimeline(days = []) {
  const container = document.getElementById('stats-daily-timeline');
  const countBadge = document.getElementById('stats-days-count-badge');
  if (!container) return;

  const activeDays = (days || [])
    .filter(d => (d && (d.totalQuestions || 0) > 0))
    .sort((a, b) => b.dateStr.localeCompare(a.dateStr));

  if (countBadge) {
    if (currentStatsRange === 'today') {
      countBadge.textContent = activeDays.length > 0 ? "Aujourd'hui (1 jour actif)" : "Aujourd'hui (0 session)";
    } else {
      countBadge.textContent = `${activeDays.length} jour${activeDays.length > 1 ? 's' : ''} actif${activeDays.length > 1 ? 's' : ''} sur la période`;
    }
  }

  if (activeDays.length === 0) {
    container.innerHTML = `
      <div class="stats-empty-state">
        <i data-lucide="calendar-x2"></i>
        <div>
          <div style="font-weight:700;color:#ffffff;margin-bottom:4px;">Aucun historique sur cette période</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">Lancez une arène de QCM pour démarrer l'enregistrement de vos journées d'étude !</div>
        </div>
      </div>
    `;
    return;
  }

  const todayStr = studyTracker.getTodayDateStr();

  let html = '';
  activeDays.forEach(d => {
    const isToday = (d.dateStr === todayStr);
    const accuracy = d.totalQuestions > 0 ? Math.round((d.correctAnswers / d.totalQuestions) * 100) : 0;
    const dateFormatted = formatDateFr(d.dateStr);

    html += `
      <div class="timeline-day-card">
        <div class="timeline-day-top">
          <div class="timeline-date-wrap">
            <span class="timeline-date-badge">${escapeHtml(dateFormatted)}</span>
            ${isToday ? '<span class="timeline-day-today">Aujourd\'hui</span>' : ''}
          </div>
          <div class="timeline-badges-row">
            <span class="timeline-pill pill-count"><i data-lucide="check-square" style="width:12px;height:12px;"></i> ${d.totalQuestions} QCM</span>
            <span class="timeline-pill pill-correct">✓ ${d.correctAnswers} justes (${accuracy}%)</span>
            <span class="timeline-pill pill-wrong">✗ ${d.wrongAnswers} fautes</span>
            <span class="timeline-pill pill-time"><i data-lucide="clock" style="width:12px;height:12px;"></i> ${formatDuration(d.totalTimeSeconds)}</span>
            <span class="timeline-pill pill-sessions"><i data-lucide="zap" style="width:12px;height:12px;"></i> ${d.sessionsCount || 1} sess.</span>
            <span class="timeline-pill pill-speed">${d.avgTimePerQuestion || '--'}s/QCM</span>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ============================================================================
// MODULE: CHRONOMÈTRE & SUIVI DU TEMPS PAR LEÇON
// ============================================================================
let currentLessonSelected = {
  name: '',
  chapterId: null
};
let lessonTimerInterval = null;
let currentStatsSubpage = 'qcm'; // 'qcm' | 'lessons'

function switchStatsSubpage(subtab, animate = true) {
  currentStatsSubpage = subtab;
  const btnQcm = document.getElementById('btn-subnav-qcm');
  const btnLessons = document.getElementById('btn-subnav-lessons');
  const pageQcm = document.getElementById('stats-subpage-qcm');
  const pageLessons = document.getElementById('stats-subpage-lessons');
  const rangeWrap = document.getElementById('stats-qcm-range-wrap');

  if (!pageQcm || !pageLessons) return;

  if (subtab === 'qcm') {
    if (btnQcm) btnQcm.classList.add('active');
    if (btnLessons) btnLessons.classList.remove('active');

    pageLessons.style.display = 'none';
    pageQcm.style.display = 'flex';

    if (animate) {
      pageQcm.classList.remove('slide-from-left', 'slide-from-right');
      void pageQcm.offsetWidth;
      pageQcm.classList.add('slide-from-left');
    }

    if (rangeWrap) rangeWrap.style.display = 'flex';
  } else {
    if (btnLessons) btnLessons.classList.add('active');
    if (btnQcm) btnQcm.classList.remove('active');

    pageQcm.style.display = 'none';
    pageLessons.style.display = 'flex';

    if (animate) {
      pageLessons.classList.remove('slide-from-left', 'slide-from-right');
      void pageLessons.offsetWidth;
      pageLessons.classList.add('slide-from-right');
    }

    if (rangeWrap) rangeWrap.style.display = 'none';
    renderLessonTrackerUI();
  }
  refreshLucide();
}

function formatDigitalClockTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(s)}`;
}

function updateLessonTimerTick() {
  const active = (typeof lessonTracker !== 'undefined' && lessonTracker) ? lessonTracker.activeTimer : null;
  const headerBadge = document.getElementById('active-lesson-header-badge');
  const headerName = document.getElementById('header-lesson-name');
  const headerTime = document.getElementById('header-lesson-time');

  const digitalClock = document.getElementById('lesson-digital-clock');
  const clockDot = document.getElementById('lesson-clock-dot');
  const statusText = document.getElementById('lesson-status-text');

  if (active && active.isRunning) {
    const elapsedSec = lessonTracker.getElapsedTimeSeconds();
    const formatted = formatDigitalClockTime(elapsedSec);

    // Update floating header badge
    if (headerBadge) {
      headerBadge.style.display = 'inline-flex';
      if (headerName) headerName.textContent = active.lessonName;
      if (headerTime) headerTime.textContent = formatted;
    }

    // Update subnav timer pill
    const subnavTimerPill = document.getElementById('subnav-active-lesson-time');
    if (subnavTimerPill) {
      subnavTimerPill.style.display = 'inline-block';
      subnavTimerPill.textContent = formatted;
    }

    // Update stats view digital clock
    if (digitalClock) {
      digitalClock.textContent = formatted;
    }
    if (clockDot) {
      clockDot.className = active.isPaused ? 'clock-status-dot status-paused' : 'clock-status-dot status-running';
    }
    if (statusText) {
      statusText.textContent = active.isPaused ? 'En pause' : 'Chronomètre en cours...';
    }
  } else {
    // No active timer running
    if (headerBadge) {
      headerBadge.style.display = 'none';
    }
    const subnavTimerPill = document.getElementById('subnav-active-lesson-time');
    if (subnavTimerPill) {
      subnavTimerPill.style.display = 'none';
    }
    if (digitalClock) {
      digitalClock.textContent = '00:00:00';
    }
    if (clockDot) {
      clockDot.className = 'clock-status-dot status-idle';
    }
    if (statusText) {
      statusText.textContent = 'Prêt à démarrer';
    }
  }
}

function initLessonTracker() {
  if (typeof lessonTracker === 'undefined' || !lessonTracker) return;

  const active = lessonTracker.activeTimer;
  if (active && active.lessonName) {
    currentLessonSelected.name = active.lessonName;
    currentLessonSelected.chapterId = active.chapterId;
  }

  setupLessonTrackerEventListeners();

  if (!lessonTimerInterval) {
    lessonTimerInterval = setInterval(updateLessonTimerTick, 1000);
  }
  updateLessonTimerTick();
}

function renderLessonTrackerUI() {
  if (typeof lessonTracker === 'undefined' || !lessonTracker) return;

  const active = lessonTracker.activeTimer;
  const btnStart = document.getElementById('btn-timer-start');
  const btnPause = document.getElementById('btn-timer-pause');
  const btnResume = document.getElementById('btn-timer-resume');
  const btnStop = document.getElementById('btn-timer-stop');
  const btnCancel = document.getElementById('btn-timer-cancel');
  const activeBadgeName = document.getElementById('active-lesson-name');
  const searchInput = document.getElementById('lesson-search-input');
  const countBadge = document.getElementById('lesson-stats-count-badge');

  if (active && active.isRunning) {
    if (activeBadgeName) activeBadgeName.textContent = active.lessonName;
    if (searchInput && !searchInput.value) searchInput.value = active.lessonName;
    currentLessonSelected.name = active.lessonName;
    currentLessonSelected.chapterId = active.chapterId;

    if (btnStart) btnStart.style.display = 'none';
    if (active.isPaused) {
      if (btnPause) btnPause.style.display = 'none';
      if (btnResume) btnResume.style.display = 'inline-flex';
    } else {
      if (btnPause) btnPause.style.display = 'inline-flex';
      if (btnResume) btnResume.style.display = 'none';
    }
    if (btnStop) btnStop.style.display = 'inline-flex';
    if (btnCancel) btnCancel.style.display = 'inline-flex';
  } else {
    if (btnStart) btnStart.style.display = 'inline-flex';
    if (btnPause) btnPause.style.display = 'none';
    if (btnResume) btnResume.style.display = 'none';
    if (btnStop) btnStop.style.display = 'none';
    if (btnCancel) btnCancel.style.display = 'none';

    if (activeBadgeName) {
      activeBadgeName.textContent = currentLessonSelected.name || 'Aucune leçon choisie';
    }
  }

  // 1. Summary Table per Lesson
  const summaryContainer = document.getElementById('lesson-summary-table-container');
  const summaries = lessonTracker.getLessonSummaries();
  if (countBadge) {
    countBadge.textContent = `${summaries.length} leçon${summaries.length > 1 ? 's' : ''} enregistrée${summaries.length > 1 ? 's' : ''}`;
  }

  if (summaryContainer) {
    if (summaries.length === 0) {
      summaryContainer.innerHTML = `
        <div class="stats-empty-state" style="padding: 24px 16px;">
          <i data-lucide="clock"></i>
          <div>
            <div style="font-weight:700;color:#ffffff;margin-bottom:4px;">Aucune leçon chronométrée pour le moment</div>
            <div style="font-size:0.8rem;color:var(--text-muted);">Choisissez un cours ci-dessus et cliquez sur <strong>Démarrer</strong> pour lancer votre premier chronomètre !</div>
          </div>
        </div>
      `;
    } else {
      const maxDuration = Math.max(...summaries.map(s => s.totalDurationSeconds || 0), 1);
      let tableHtml = `
        <table class="lesson-summary-table">
          <thead>
            <tr>
              <th>Leçon / Cours</th>
              <th>Temps Cumulé</th>
              <th>Sessions</th>
              <th>Dernière Étude</th>
              <th>Part relative</th>
            </tr>
          </thead>
          <tbody>
      `;

      summaries.forEach(s => {
        const pct = Math.round((s.totalDurationSeconds / maxDuration) * 100);
        const lastDateFormatted = s.lastSessionDateStr ? formatDateFr(s.lastSessionDateStr) : '--';
        tableHtml += `
          <tr>
            <td>
              <span class="table-lesson-name">
                <i data-lucide="book-open" style="width:14px;height:14px;color:var(--cyan);flex-shrink:0;"></i>
                <span>${escapeHtml(s.lessonName)}</span>
              </span>
            </td>
            <td>
              <span class="table-time-pill">${formatDuration(s.totalDurationSeconds)}</span>
            </td>
            <td>
              <span class="table-sessions-badge">${s.sessionsCount} session${s.sessionsCount > 1 ? 's' : ''}</span>
            </td>
            <td style="color:var(--text-muted);font-size:0.78rem;">
              ${escapeHtml(lastDateFormatted)}
            </td>
            <td>
              <div class="table-progress-wrap">
                <div class="table-progress-track">
                  <div class="table-progress-bar" style="width: ${pct}%;"></div>
                </div>
                <span style="font-size:0.75rem;color:var(--text-dim);width:32px;text-align:right;">${pct}%</span>
              </div>
            </td>
          </tr>
        `;
      });

      tableHtml += `</tbody></table>`;
      summaryContainer.innerHTML = tableHtml;
    }
  }

  // 2. Recent Sessions List
  const sessionsContainer = document.getElementById('lesson-sessions-list');
  const recentSessions = lessonTracker.getSessions().slice(0, 15);

  if (sessionsContainer) {
    if (recentSessions.length === 0) {
      sessionsContainer.innerHTML = `
        <div style="text-align:center;padding:16px;color:var(--text-dim);font-size:0.8rem;">
          L'historique des sessions apparaîtra ici après votre premier chronométrage.
        </div>
      `;
    } else {
      let sessionsHtml = '';
      recentSessions.forEach(sess => {
        const dateFormatted = sess.dateStr ? formatDateFr(sess.dateStr) : '';
        const timeObj = sess.endTime ? new Date(sess.endTime) : null;
        const timeStr = timeObj ? timeObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
        sessionsHtml += `
          <div class="lesson-session-row">
            <div class="session-left-meta">
              <span class="session-lesson-title">${escapeHtml(sess.lessonName)}</span>
              <span class="session-date-time">${escapeHtml(dateFormatted)}${timeStr ? ' à ' + timeStr : ''}</span>
            </div>
            <div class="session-right-actions">
              <span class="session-duration-tag">${formatDuration(sess.durationSeconds)}</span>
              <button type="button" class="btn-delete-session" data-session-id="${escapeHtml(sess.id)}" title="Supprimer cette session">
                <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
              </button>
            </div>
          </div>
        `;
      });
      sessionsContainer.innerHTML = sessionsHtml;

      // Attach delete click handlers
      sessionsContainer.querySelectorAll('.btn-delete-session').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const sessId = btn.dataset.sessionId;
          if (confirm('Voulez-vous supprimer cette session de travail ?')) {
            lessonTracker.deleteSession(sessId);
            renderLessonTrackerUI();
            firebaseSyncService.pushState();
          }
        };
      });
    }
  }

  updateLessonTimerTick();
  refreshLucide();
}

function setupLessonTrackerEventListeners() {
  const searchInput = document.getElementById('lesson-search-input');
  const clearBtn = document.getElementById('btn-clear-lesson-input');
  const dropdown = document.getElementById('lesson-dropdown');
  const dropdownItems = document.getElementById('lesson-dropdown-items');

  function renderDropdown(filterText = '') {
    if (!dropdown || !dropdownItems) return;
    const cleanFilter = (filterText || '').trim().toLowerCase();
    const matches = allChapters.filter(ch => {
      if (!cleanFilter) return true;
      return (ch.title || '').toLowerCase().includes(cleanFilter);
    });

    let itemsHtml = '';
    matches.forEach(ch => {
      itemsHtml += `
        <div class="lesson-dropdown-item" data-chapter-id="${escapeHtml(ch.id)}" data-chapter-title="${escapeHtml(ch.title)}">
          <span>${escapeHtml(ch.title)}</span>
          <span class="item-badge">${ch.count || 0} QCM</span>
        </div>
      `;
    });

    // Custom choice option if input has text
    if (cleanFilter.length > 0) {
      itemsHtml = `
        <div class="lesson-dropdown-item custom-choice" data-chapter-id="" data-chapter-title="${escapeHtml(filterText.trim())}">
          <span>✏️ Utiliser « <strong>${escapeHtml(filterText.trim())}</strong> »</span>
          <span class="item-badge">Nom libre</span>
        </div>
      ` + itemsHtml;
    }

    if (!itemsHtml) {
      itemsHtml = `
        <div class="lesson-dropdown-item custom-choice" data-chapter-id="" data-chapter-title="${escapeHtml(filterText.trim())}">
          <span>✏️ Utiliser « <strong>${escapeHtml(filterText.trim())}</strong> »</span>
          <span class="item-badge">Nom libre</span>
        </div>
      `;
    }

    dropdownItems.innerHTML = itemsHtml;
    dropdown.style.display = 'flex';

    // Item click
    dropdownItems.querySelectorAll('.lesson-dropdown-item').forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        const title = item.dataset.chapterTitle;
        const chId = item.dataset.chapterId || null;
        currentLessonSelected.name = title;
        currentLessonSelected.chapterId = chId;
        if (searchInput) searchInput.value = title;
        if (clearBtn) clearBtn.style.display = 'block';
        const activeNameEl = document.getElementById('active-lesson-name');
        if (activeNameEl) activeNameEl.textContent = title;
        dropdown.style.display = 'none';
      };
    });
  }

  if (searchInput) {
    searchInput.oninput = () => {
      const val = searchInput.value;
      if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';
      currentLessonSelected.name = val.trim();
      currentLessonSelected.chapterId = null;
      const activeNameEl = document.getElementById('active-lesson-name');
      if (activeNameEl) activeNameEl.textContent = val.trim() || 'Aucune leçon choisie';
      renderDropdown(val);
    };

    searchInput.onfocus = () => {
      renderDropdown(searchInput.value);
    };
  }

  if (clearBtn) {
    clearBtn.onclick = () => {
      if (searchInput) searchInput.value = '';
      clearBtn.style.display = 'none';
      currentLessonSelected.name = '';
      currentLessonSelected.chapterId = null;
      const activeNameEl = document.getElementById('active-lesson-name');
      if (activeNameEl) activeNameEl.textContent = 'Aucune leçon choisie';
      if (dropdown) dropdown.style.display = 'none';
    };
  }

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (dropdown && !dropdown.contains(e.target) && searchInput && e.target !== searchInput) {
      dropdown.style.display = 'none';
    }
  });

  // Action Buttons
  const btnStart = document.getElementById('btn-timer-start');
  if (btnStart) {
    btnStart.onclick = () => {
      const name = currentLessonSelected.name || searchInput?.value?.trim();
      if (!name) {
        alert('Veuillez sélectionner ou taper le nom d\'une leçon avant de démarrer le chronomètre.');
        if (searchInput) searchInput.focus();
        return;
      }
      currentLessonSelected.name = name;
      lessonTracker.startTimer(currentLessonSelected.name, currentLessonSelected.chapterId);
      renderLessonTrackerUI();
      updateLessonTimerTick();
      firebaseSyncService.pushState();
    };
  }

  const btnPause = document.getElementById('btn-timer-pause');
  if (btnPause) {
    btnPause.onclick = () => {
      lessonTracker.pauseTimer();
      renderLessonTrackerUI();
      updateLessonTimerTick();
    };
  }

  const btnResume = document.getElementById('btn-timer-resume');
  if (btnResume) {
    btnResume.onclick = () => {
      lessonTracker.resumeTimer();
      renderLessonTrackerUI();
      updateLessonTimerTick();
    };
  }

  const btnStop = document.getElementById('btn-timer-stop');
  if (btnStop) {
    btnStop.onclick = () => {
      const session = lessonTracker.stopAndSaveSession();
      if (session) {
        renderLessonTrackerUI();
        updateLessonTimerTick();
        firebaseSyncService.pushState();
      } else {
        alert('Session trop courte (moins de 1 seconde) : non enregistrée.');
        renderLessonTrackerUI();
        updateLessonTimerTick();
      }
    };
  }

  const btnCancel = document.getElementById('btn-timer-cancel');
  if (btnCancel) {
    btnCancel.onclick = () => {
      if (confirm('Voulez-vous vraiment annuler ce chronomètre sans enregistrer le temps ?')) {
        lessonTracker.cancelTimer();
        renderLessonTrackerUI();
        updateLessonTimerTick();
      }
    };
  }

  // Sub-navigation buttons (QCM vs Cours)
  const btnSubnavQcm = document.getElementById('btn-subnav-qcm');
  if (btnSubnavQcm) {
    btnSubnavQcm.onclick = () => switchStatsSubpage('qcm');
  }

  const btnSubnavLessons = document.getElementById('btn-subnav-lessons');
  if (btnSubnavLessons) {
    btnSubnavLessons.onclick = () => switchStatsSubpage('lessons');
  }

  // Header quick badge click
  const headerBadge = document.getElementById('active-lesson-header-badge');
  if (headerBadge) {
    headerBadge.onclick = () => {
      switchView('stats');
      switchStatsSubpage('lessons');
    };
  }
}

// ============================================================================
// EVENT LISTENERS & KEYBOARD BINDINGS
// ============================================================================
function setupEventListeners() {
  // Navigation
  document.getElementById('btn-home-logo').onclick = () => switchView('dashboard');
  document.getElementById('btn-leave-arena').onclick = () => switchView('dashboard');
  document.getElementById('btn-leave-notebook').onclick = () => switchView('dashboard');
  const btnLeaveStats = document.getElementById('btn-leave-stats');
  if (btnLeaveStats) btnLeaveStats.onclick = () => switchView('dashboard');

  document.getElementById('btn-open-notebook').onclick = () => switchView('notebook');
  document.getElementById('btn-open-notebook-icon').onclick = () => switchView('notebook');

  const btnOpenStats = document.getElementById('btn-open-stats');
  if (btnOpenStats) btnOpenStats.onclick = () => switchView('stats');

  const btnOpenStatsIcon = document.getElementById('btn-open-stats-icon');
  if (btnOpenStatsIcon) btnOpenStatsIcon.onclick = () => switchView('stats');

  // Stats range toggle buttons & Day Stepper
  const rangeToggle = document.getElementById('stats-range-toggle');
  const customPicker = document.getElementById('custom-range-picker');
  const customStartInput = document.getElementById('custom-date-start');
  const customEndInput = document.getElementById('custom-date-end');
  const btnApplyCustom = document.getElementById('btn-apply-custom-range');

  const btnPrevDay = document.getElementById('btn-stats-prev-day');
  if (btnPrevDay) {
    btnPrevDay.onclick = (e) => {
      e.stopPropagation();
      selectedDayOffset--;
      currentStatsRange = 'today';
      rangeToggle?.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('btn-range-day')?.classList.add('active');
      if (customPicker) customPicker.style.display = 'none';
      renderStatsUI();
      refreshLucide();
    };
  }

  const btnNextDay = document.getElementById('btn-stats-next-day');
  if (btnNextDay) {
    btnNextDay.onclick = (e) => {
      e.stopPropagation();
      if (selectedDayOffset < 0) {
        selectedDayOffset++;
        currentStatsRange = 'today';
        rangeToggle?.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('btn-range-day')?.classList.add('active');
        if (customPicker) customPicker.style.display = 'none';
        renderStatsUI();
        refreshLucide();
      }
    };
  }

  if (rangeToggle) {
    rangeToggle.querySelectorAll('.range-btn').forEach(btn => {
      btn.onclick = () => {
        rangeToggle.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const r = btn.dataset.range || 'today';

        if (r === 'today') {
          if (currentStatsRange === 'today' && selectedDayOffset !== 0) {
            // Re-cliquer sur le bouton alors qu'on est sur Hier réinitialise à Aujourd'hui
            selectedDayOffset = 0;
          }
          currentStatsRange = 'today';
        } else {
          selectedDayOffset = 0; // Réinitialiser le décalage si on va vers 7j, 30j, tout
          currentStatsRange = r;
        }

        if (r === 'custom') {
          if (customPicker) {
            customPicker.style.display = 'flex';
            const today = studyTracker.getTodayDateStr();
            if (customEndInput && !customEndInput.value) customEndInput.value = today;
            if (customStartInput && !customStartInput.value) {
              const d = new Date();
              d.setDate(d.getDate() - 7);
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              customStartInput.value = `${y}-${m}-${day}`;
            }
            customStatsStart = customStartInput.value;
            customStatsEnd = customEndInput.value;
            renderStatsUI();
          }
        } else {
          if (customPicker) customPicker.style.display = 'none';
          renderStatsUI();
        }
        refreshLucide();
      };
    });
  }

  if (btnApplyCustom) {
    btnApplyCustom.onclick = () => {
      customStatsStart = customStartInput?.value || '';
      customStatsEnd = customEndInput?.value || '';
      if (!customStatsStart || !customStatsEnd) {
        alert('Veuillez sélectionner une date de début et une date de fin.');
        return;
      }
      renderStatsUI();
      refreshLucide();
    };
  }

  // Course Questions Tracker (Pills mode & mini search)
  const cmodeToggle = document.getElementById('course-tracker-mode-toggle');
  if (cmodeToggle) {
    cmodeToggle.querySelectorAll('.course-pill-btn').forEach(btn => {
      btn.onclick = () => {
        cmodeToggle.querySelectorAll('.course-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        courseTrackerMode = btn.dataset.cmode || 'period';
        renderStatsChapters(lastRenderedChapterTotals, lastRenderedPeriodLabel);
        refreshLucide();
      };
    });
  }

  const courseSearchInput = document.getElementById('course-tracker-search');
  if (courseSearchInput) {
    courseSearchInput.oninput = (e) => {
      courseTrackerSearchQuery = e.target.value;
      renderStatsChapters(lastRenderedChapterTotals, lastRenderedPeriodLabel);
      refreshLucide();
    };
  }

  // Auto-pause timer when tab is hidden or phone goes to lock screen
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      studyTracker.pauseTimer();
    } else {
      studyTracker.resumeTimer();
    }
  });

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

  // History Navigation in Arena
  const btnHistPrev = document.getElementById('btn-history-prev');
  if (btnHistPrev) btnHistPrev.onclick = () => window.navigateHistoryPrev();
  const btnHistNext = document.getElementById('btn-history-next');
  if (btnHistNext) btnHistNext.onclick = () => window.navigateHistoryNext();
  const btnHistResume = document.getElementById('btn-history-resume-action');
  if (btnHistResume) btnHistResume.onclick = () => window.resumeActiveDrill();


  // Error modal
  document.getElementById('btn-continue-after-error').onclick = closeErrorModalAndContinue;
  document.getElementById('btn-close-error-modal').onclick = closeErrorModalAndContinue;

  // Notebook search, chapter filter & sorting controls
  document.getElementById('notebook-search-input').oninput = (e) => {
    renderNotebookUI(e.target.value);
  };
  const notebookSortSelect = document.getElementById('notebook-sort-by');
  if (notebookSortSelect) {
    notebookSortSelect.onchange = (e) => {
      notebookSortBy = e.target.value;
      const searchVal = document.getElementById('notebook-search-input')?.value || '';
      renderNotebookUI(searchVal);
    };
  }
  const btnSortOrder = document.getElementById('btn-toggle-sort-order');
  if (btnSortOrder) {
    btnSortOrder.onclick = () => {
      notebookSortOrder = (notebookSortOrder === 'desc') ? 'asc' : 'desc';
      updateSortOrderButtonUI();
      const searchVal = document.getElementById('notebook-search-input')?.value || '';
      renderNotebookUI(searchVal);
    };
  }
  const btnViewChapter = document.getElementById('btn-view-mode-chapter');
  const btnViewFlat = document.getElementById('btn-view-mode-flat');
  if (btnViewChapter && btnViewFlat) {
    btnViewChapter.onclick = () => {
      notebookViewMode = 'chapter';
      btnViewChapter.classList.add('active');
      btnViewFlat.classList.remove('active');
      const searchVal = document.getElementById('notebook-search-input')?.value || '';
      renderNotebookUI(searchVal);
    };
    btnViewFlat.onclick = () => {
      notebookViewMode = 'flat';
      btnViewFlat.classList.add('active');
      btnViewChapter.classList.remove('active');
      const searchVal = document.getElementById('notebook-search-input')?.value || '';
      renderNotebookUI(searchVal);
    };
  }
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
  const versionBadgeEl = document.getElementById('settings-current-app-version');
  if (versionBadgeEl && typeof CURRENT_APP_VERSION !== 'undefined') {
    versionBadgeEl.textContent = `v${CURRENT_APP_VERSION}`;
  }

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

  // GitHub Releases Update Buttons
  const btnCheckUpdates = document.getElementById('btn-check-updates-manual');
  if (btnCheckUpdates) {
    btnCheckUpdates.onclick = () => {
      if (typeof updateService !== 'undefined' && updateService) {
        updateService.checkForUpdates(true);
      }
    };
  }

  const btnCloseUpdateModal = document.getElementById('btn-close-update-modal');
  if (btnCloseUpdateModal) {
    btnCloseUpdateModal.onclick = () => {
      if (typeof updateService !== 'undefined' && updateService) {
        updateService.closeUpdateModal();
      } else if (modals.update) {
        modals.update.style.display = 'none';
      }
    };
  }

  const btnUpdateLater = document.getElementById('btn-update-later');
  if (btnUpdateLater) {
    btnUpdateLater.onclick = () => {
      if (typeof updateService !== 'undefined' && updateService) {
        updateService.closeUpdateModal();
      } else if (modals.update) {
        modals.update.style.display = 'none';
      }
    };
  }

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
    // If media lightbox is open, Escape closes it
    const lightboxModal = document.getElementById('media-lightbox-modal');
    if (lightboxModal && lightboxModal.style.display === 'flex') {
      if (e.key === 'Escape') {
        e.preventDefault();
        window.closeMediaLightbox();
        return;
      }
    }

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
      // Navigation dans l'historique via les flèches du clavier
      if (e.key === 'ArrowLeft') {
        if (answeredHistory.length > 0 && historyCursor < answeredHistory.length - 1) {
          e.preventDefault();
          window.navigateHistoryPrev();
          return;
        }
      } else if (e.key === 'ArrowRight') {
        if (historyCursor >= 0) {
          e.preventDefault();
          window.navigateHistoryNext();
          return;
        }
      }

      // En mode consultation d'historique, désactiver la sélection et permettre à Entrée de reprendre le drill
      if (historyCursor >= 0) {
        if (e.key === 'Enter') {
          e.preventDefault();
          window.resumeActiveDrill();
        }
        return;
      }

      // Options 1-5 or A-E (mode drill actif uniquement)
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



// ============================================================================
// ARENA AI TUTOR CHAT CONTROLLER (AVEC PERSISTANCE PAR QUESTION)
// ============================================================================
let arenaChatHistory = [];
let questionChatHistories = {}; // { [questionUid]: [ { role, text, modelUsed, timestamp }, ... ] }

function renderExistingChatMessages() {
  const listEl = document.getElementById('chatbox-messages-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  renderChatWelcome();
  arenaChatHistory.forEach(msg => {
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
  refreshLucide();
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
    if (arenaChatHistory.length === 0) {
      renderChatWelcome();
    } else {
      renderExistingChatMessages();
    }
    const inputEl = document.getElementById('chatbox-text-input');
    if (inputEl) setTimeout(() => inputEl.focus(), 150);
  }
  refreshLucide();
};

window.clearArenaChat = function() {
  const effQ = getEffectiveArenaQuestion();
  arenaChatHistory = [];
  if (effQ && effQ.uid) {
    delete questionChatHistories[effQ.uid];
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

function updateArenaChatContext() {
  const qTextEl = document.getElementById('chatbox-q-statement');
  const ctxEl = document.getElementById('chatbox-current-context');
  const effQ = getEffectiveArenaQuestion();
  if (effQ) {
    // Restore per-question chat history
    arenaChatHistory = questionChatHistories[effQ.uid] ? [...questionChatHistories[effQ.uid]] : [];
    const chatbox = document.getElementById('arena-ai-chatbox');
    if (chatbox && chatbox.style.display !== 'none') {
      if (arenaChatHistory.length > 0) {
        renderExistingChatMessages();
      } else {
        renderChatWelcome();
      }
    }

    if (qTextEl) {
      const qText = effQ.question || effQ.statement || 'Question pédiatrique';
      qTextEl.textContent = qText.length > 80 ? qText.slice(0, 80) + '...' : qText;
    }
    if (ctxEl) {
      const isHistory = historyCursor >= 0;
      const isRevealed = isArenaChapterRevealed();
      const blurClass = isRevealed ? 'is-revealed' : 'is-blurred';
      const blurTitle = isRevealed 
        ? 'Cours visible (Cliquer pour masquer)' 
        : 'Cours masqué jusqu\'à ce que vous répondiez (Cliquer pour afficher)';
      const histSuffix = isHistory ? ` (QCM -${historyCursor + 1})` : '';

      ctxEl.innerHTML = `Pédiatrie — <span class="chatbox-chapter-blurred ${blurClass}" onclick="window.toggleArenaChapterTitle()" title="${blurTitle}">${escapeHtml(effQ.chapterTitle || 'Général')}</span>${histSuffix}`;
    }
  }
}

function renderChatWelcome() {
  const listEl = document.getElementById('chatbox-messages-list');
  if (!listEl) return;
  const effQ = getEffectiveArenaQuestion();
  const chapTitle = effQ ? (effQ.chapterTitle || 'Pédiatrie') : 'Pédiatrie';
  const isHistory = historyCursor >= 0;
  const isRevealed = isArenaChapterRevealed();
  const blurClass = isRevealed ? 'is-revealed' : 'is-blurred';
  const blurTitle = isRevealed 
    ? 'Cours visible (Cliquer pour masquer)' 
    : 'Cours masqué jusqu\'à ce que vous répondiez (Cliquer pour afficher)';

  listEl.innerHTML = `
    <div class="chat-bubble bubble-ai">
      <p>👋 Bonjour ! Je suis votre <strong>Tuteur IA Pédiatrique</strong>.</p>
      <p>Je connais par cœur l'énoncé, le cas clinique, les propositions et la justification officielle de ce QCM ${isHistory ? '<strong>en cours de consultation</strong>' : ''} en <strong class="chatbox-chapter-blurred ${blurClass}" onclick="window.toggleArenaChapterTitle()" title="${blurTitle}">${escapeHtml(chapTitle)}</strong>.</p>
      <p style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">
        Posez-moi votre question directement ou cliquez sur une suggestion rapide :
      </p>
    </div>
  `;
}

async function executeSendMessage(userText) {
  const effQ = getEffectiveArenaQuestion();
  if (!effQ) return;
  const targetUid = effQ.uid;
  const listEl = document.getElementById('chatbox-messages-list');
  if (!listEl) return;

  // 1. Add user bubble
  arenaChatHistory.push({ role: 'user', text: userText, timestamp: Date.now() });
  if (targetUid) {
    questionChatHistories[targetUid] = [...arenaChatHistory];
  }

  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble bubble-user';
  userBubble.textContent = userText;
  listEl.appendChild(userBubble);
  listEl.scrollTop = listEl.scrollHeight;

  // 2. Add loading bubble
  const loadingBubble = document.createElement('div');
  loadingBubble.className = 'chat-bubble bubble-ai is-loading';
  loadingBubble.id = 'chatbox-loading-indicator';
  loadingBubble.innerHTML = `
    <div class="typing-indicator"><span></span><span></span><span></span></div>
    <span>Gemini Flash analyse ce QCM...</span>
  `;
  listEl.appendChild(loadingBubble);
  listEl.scrollTop = listEl.scrollHeight;

  // Disable controls while thinking
  const sendBtn = document.getElementById('btn-chat-send');
  const inputEl = document.getElementById('chatbox-text-input');
  if (sendBtn) sendBtn.disabled = true;
  if (inputEl) inputEl.disabled = true;

  try {
    const historyForAi = arenaChatHistory.slice(0, -1);
    const response = await geminiService.askAboutQuestion(effQ, historyForAi, userText);

    if (targetUid) {
      if (!questionChatHistories[targetUid]) questionChatHistories[targetUid] = [];
      questionChatHistories[targetUid].push({ role: 'ai', text: response.text, modelUsed: response.modelUsed, timestamp: Date.now() });
    }

    // ONLY append to DOM if student is STILL on targetUid!
    const currentEffQ = getEffectiveArenaQuestion();
    if (currentEffQ && currentEffQ.uid === targetUid) {
      const existingLoader = document.getElementById('chatbox-loading-indicator');
      if (existingLoader) existingLoader.remove();

      arenaChatHistory = [...questionChatHistories[targetUid]];
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
      errBubble.innerHTML = `⚠️ Erreur de réponse IA : <em>${escapeHtml(err.message)}</em>`;
      listEl.appendChild(errBubble);
    }
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    if (inputEl) {
      inputEl.disabled = false;
      inputEl.focus();
    }
    listEl.scrollTop = listEl.scrollHeight;
    refreshLucide();
  }
}
