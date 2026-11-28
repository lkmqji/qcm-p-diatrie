// ============================================================================
// Dashboard, Sélecteur de Modules, Paramètres & Synchronisation Google UI
// ============================================================================
import {
  appState,
  getDatasetForModule,
  queueEngine,
  getClinicalModePreference,
  getDomModals
} from '../state/appState.js';
import {
  getActiveModuleId,
  setActiveModuleId,
  getActiveModule,
  getAllYearsWithModules,
  getExamDate,
  getExamCountdown
} from '../services/moduleCatalog.js';
import { geminiService } from '../services/gemini.js';
import { studyTracker } from '../services/studyTracker.js';
import { lessonTracker } from '../services/lessonTracker.js';
import { formatNumber, escapeHtml } from '../utils/formatters.js';
import { refreshLucide, showAppToast } from '../utils/uiDialogs.js';
import { loadNextArenaQuestion, loadAiExplanationsCache } from './arenaView.js';
import { renderNotebookUI, resetNotebookViewFilters } from './notebookView.js';
import { renderStatsUI } from './statsView.js';
import { resetLessonViewFilters } from './lessonView.js';

export function updateModalLocalSummary() {
  const summaryEl = document.getElementById('sync-local-summary');
  if (!summaryEl) return;
  const metrics = queueEngine.getDashboardMetrics();
  const notesCount = queueEngine.getRawReasoningNotes().length;
  summaryEl.textContent = `${metrics.masteredCount} maîtrisées • ${notesCount} note${notesCount > 1 ? 's' : ''} IA`;
}

export function updateGoogleAccountUI(status, detail, user, lastSyncText) {
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

export function setupFirebaseService() {
  const fbService = appState.firebaseSyncService;
  if (!fbService) return;
  fbService.init();

  const cfg = fbService.getSavedConfig();
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

export function getExamCountdownMetrics(totalIterationsRequired) {
  const cd = getExamCountdown();
  let daysLeft = 28;
  let examDateStr = 'Non définie';

  if (cd.hasDate) {
    examDateStr = cd.shortFormattedDate || (cd.dateString ? cd.dateString.split('-').reverse().slice(0, 2).join('/') : cd.formattedDate);
    if (cd.isToday || cd.isExpired) {
      daysLeft = 1;
    } else {
      daysLeft = Math.max(1, cd.daysRemaining);
    }
  }

  const dailyIterationsRequired = Math.ceil(Math.max(0, totalIterationsRequired) / daysLeft);

  return {
    examDateStr,
    shortFormattedDate: examDateStr,
    fullFormattedDate: cd.formattedDate || examDateStr,
    daysLeft: cd.hasDate ? (cd.isToday ? 0 : cd.daysRemaining) : null,
    effectiveDaysLeft: daysLeft,
    dailyIterationsRequired,
    isToday: cd.isToday,
    isExpired: cd.isExpired,
    hasDate: cd.hasDate,
    rawCountdown: cd
  };
}

export function updateArenaDailyBadge() {
  const dailyBadge = document.getElementById('arena-daily-pill');
  if (!dailyBadge) return;
  const metrics = queueEngine.getDashboardMetrics();
  const countdown = getExamCountdownMetrics(metrics.totalIterationsRequired);
  const todayTracker = queueEngine.getTodayTracker();
  const jText = countdown.hasDate ? (countdown.isToday ? 'Jour J' : `J-${countdown.daysLeft}`) : 'Obj.';
  dailyBadge.innerHTML = `<i data-lucide="target" style="width:12px;height:12px;display:inline;"></i> <span>${todayTracker.count}/${countdown.dailyIterationsRequired} auj. (${jText})</span>`;
  refreshLucide(dailyBadge);
}

export function updateActiveModuleBadge() {
  const activePill = document.getElementById('settings-active-module-pill');
  const mod = getActiveModule();
  if (activePill && mod) {
    activePill.textContent = `${mod.title} (${mod.yearNumber || 5}ème Année)`;
  }
}

export function updateSettingsCountdownPreview(dateStr) {
  const previewBadge = document.getElementById('settings-countdown-preview');
  const previewText = document.getElementById('settings-countdown-preview-text');
  if (!previewBadge || !previewText) return;

  if (!dateStr) {
    previewBadge.className = 'exam-countdown-preview-badge';
    previewText.textContent = 'Date non définie';
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const parts = dateStr.split('-');
  const exam = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  exam.setHours(0, 0, 0, 0);

  const diffTime = exam.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    previewBadge.className = 'exam-countdown-preview-badge today';
    previewText.textContent = "Jour J ! (Aujourd'hui)";
  } else if (diffDays < 0) {
    previewBadge.className = 'exam-countdown-preview-badge expired';
    previewText.textContent = `Examen passé (+${Math.abs(diffDays)} j)`;
  } else {
    previewBadge.className = 'exam-countdown-preview-badge';
    previewText.textContent = `⏳ J-${diffDays} jours restants`;
  }
}

export function updateGeminiKeyCounterBadge(rawText = null) {
  const countBadge = document.getElementById('settings-gemini-keys-count');
  if (!countBadge) return;
  const source = rawText !== null
    ? String(rawText)
    : (document.getElementById('settings-gemini-key')?.value || geminiService.getApiKey() || '');
  const keys = Array.from(new Set(
    source.split(/[\n,;]+/).map(k => k.trim()).filter(k => k.length > 0)
  ));
  const count = keys.length;
  countBadge.textContent = `${count} clé${count > 1 ? 's' : ''} configurée${count > 1 ? 's' : ''}`;
  countBadge.classList.toggle('is-empty', count === 0);
  countBadge.classList.toggle('is-multi', count > 1);
}

export function switchActiveModule(moduleId, fromRemote = false) {
  const mod = setActiveModuleId(moduleId);
  const nextDataset = getDatasetForModule(mod.id);
  appState.activeDataset = nextDataset;
  appState.allQuestions = nextDataset.questions;
  appState.allChapters = nextDataset.chapters;
  appState.questionsMap = new Map(appState.allQuestions.map(q => [q.uid, q]));
  appState.chaptersMap = new Map(appState.allChapters.map(c => [c.id, c]));

  queueEngine.switchModule(appState.allQuestions, appState.allChapters, mod.id);
  if (studyTracker && typeof studyTracker.reloadForModule === 'function') {
    studyTracker.reloadForModule();
  }
  if (lessonTracker && typeof lessonTracker.reloadForModule === 'function') {
    lessonTracker.reloadForModule();
  }

  const fbService = appState.firebaseSyncService;
  if (fbService) {
    if (fromRemote) {
      fbService.setupModuleListener(mod.id);
    } else {
      fbService.switchListeningModule(mod.id);
    }
  }

  resetLessonViewFilters(mod.id);
  resetNotebookViewFilters();

  if (typeof loadAiExplanationsCache === 'function') {
    appState.aiExplanationsCache = loadAiExplanationsCache();
  }

  const headerSubtitle = document.querySelector('.brand-subtitle');
  if (headerSubtitle) {
    headerSubtitle.textContent = `${mod.title} • Répétition Espacée & Raisonnement IA`;
  }

  const chatTutorTitle = document.getElementById('chatbox-tutor-title');
  if (chatTutorTitle) {
    chatTutorTitle.textContent = `Tuteur IA ${mod.title}`;
  }

  const lightboxImg = document.getElementById('media-lightbox-img');
  if (lightboxImg) {
    lightboxImg.alt = `Iconographie ${mod.title} HD`;
  }

  updateActiveModuleBadge();
  renderModuleSelectorUI();
  updateDashboardUI();
  updateArenaDailyBadge();

  if (appState.currentView === 'arena') {
    loadNextArenaQuestion();
  } else if (appState.currentView === 'notebook') {
    renderNotebookUI();
  } else if (appState.currentView === 'stats') {
    renderStatsUI();
  }

  showAppToast(`✅ Module ${mod.title} activé ! (${appState.allQuestions.length} QCM)`, { type: 'success' });
}

export function renderModuleSelectorUI() {
  const container = document.getElementById('settings-years-accordion');
  if (!container) return;

  const yearsData = getAllYearsWithModules();
  const activeModuleId = getActiveModuleId();
  const availableModuleNames = yearsData
    .flatMap(y => y.modules)
    .filter(m => m.available)
    .map(m => m.title);

  let html = '';
  yearsData.forEach(y => {
    const hasActive = y.modules.some(m => m.id === activeModuleId);
    const isOpen = hasActive || y.year === 5;

    html += `
      <div class="year-accordion-item ${isOpen ? 'open' : ''} ${hasActive ? 'has-active' : ''}" data-year-id="${y.id}">
        <button type="button" class="year-accordion-trigger" data-year-toggle="${y.id}">
          <div class="year-trigger-left">
            <div class="year-number-badge">${y.year}</div>
            <div>
              <div class="year-title-text">${escapeHtml(y.title)}</div>
              <div class="year-meta-text">${y.modules.length} modules • ${y.coursesCount} cours • ${formatNumber(y.qcmCount)} QCM</div>
            </div>
          </div>
          <div class="year-trigger-right">
            ${hasActive ? '<span class="module-card-badge available active-badge" style="font-size:0.65rem;">Actif</span>' : ''}
            <i data-lucide="chevron-down" class="year-chevron-icon"></i>
          </div>
        </button>

        <div class="year-accordion-content">
          <div class="modules-grid-container">
    `;

    y.modules.forEach(m => {
      const isAvailable = m.available;
      const isActive = m.id === activeModuleId;

      if (isAvailable) {
        html += `
          <div class="module-card available ${isActive ? 'active' : ''}" data-module-select="${m.id}" title="Module actif et disponible">
            <div class="module-card-header">
              <span class="module-card-badge available ${isActive ? 'active-badge' : ''}">
                ${isActive ? '✓ Actif' : 'Disponible'}
              </span>
              <i data-lucide="${isActive ? 'check-circle' : 'book-open'}" style="width:14px;height:14px;color:${isActive ? 'var(--emerald)' : 'var(--cyan)'};"></i>
            </div>
            <div class="module-card-title">${escapeHtml(m.title)}</div>
            <div class="module-card-stats">
              <span><i data-lucide="file-text" style="width:11px;height:11px;"></i> ${m.courses} cours</span>
              <span>•</span>
              <span><i data-lucide="help-circle" style="width:11px;height:11px;"></i> ${formatNumber(m.qcm)} QCM</span>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="module-card skeleton-disabled" data-module-locked="${m.id}" data-module-title="${escapeHtml(m.title)}" title="Module en cours de numérisation (QCM à venir)">
            <div class="module-card-header">
              <span class="module-card-badge soon">Bientôt</span>
              <i data-lucide="lock" style="width:12px;height:12px;color:var(--text-dim);"></i>
            </div>
            <div class="module-card-title">${escapeHtml(m.title)}</div>
            <div class="module-card-stats">
              <span><i data-lucide="file-text" style="width:11px;height:11px;"></i> ${m.courses} cours</span>
              <span>•</span>
              <span><i data-lucide="help-circle" style="width:11px;height:11px;"></i> ${formatNumber(m.qcm)} QCM</span>
            </div>
          </div>
        `;
      }
    });

    html += `
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll('[data-year-toggle]').forEach(trigger => {
    trigger.onclick = (e) => {
      e.preventDefault();
      const item = trigger.closest('.year-accordion-item');
      if (item) item.classList.toggle('open');
      refreshLucide(item);
    };
  });

  container.querySelectorAll('[data-module-select]').forEach(card => {
    card.onclick = (e) => {
      e.preventDefault();
      const modId = card.getAttribute('data-module-select');
      try {
        switchActiveModule(modId);
      } catch (err) {
        showAppToast(err.message, { type: 'error' });
      }
    };
  });

  container.querySelectorAll('[data-module-locked]').forEach(card => {
    card.onclick = (e) => {
      e.preventDefault();
      const modTitle = card.getAttribute('data-module-title') || 'Ce module';
      card.classList.remove('module-shake');
      void card.offsetWidth;
      card.classList.add('module-shake');
      const availText = availableModuleNames.length > 0 ? availableModuleNames.join(', ') : 'Pédiatrie';
      showAppToast(`🔒 ${modTitle} : questions en cours de numérisation. Disponibles : ${availText}.`);
    };
  });

  refreshLucide(container);
}

export function renderDashboardExamBanner(countdown, _metrics) {
  const container = document.getElementById('dashboard-exam-banner-container');
  if (!container) return;

  const activeMod = getActiveModule();
  const modTitle = activeMod ? activeMod.title : 'Pédiatrie';
  const yearTitle = activeMod ? `${activeMod.yearNumber || 5}ème Année` : '5ème Année';

  let dateText = '';
  if (countdown.hasDate) {
    const daysInfo = countdown.isToday ? '• Jour J !' : (countdown.isExpired ? '• Passé' : `• J-${countdown.daysLeft}`);
    dateText = `Date d'examen : <strong>${escapeHtml(countdown.fullFormattedDate)}</strong> <span class="header-date-badge">${daysInfo}</span>`;
  } else {
    dateText = `Aucune date d'examen définie • <em>Cliquer pour fixer la date</em>`;
  }

  container.innerHTML = `
    <div class="dashboard-module-header" id="btn-banner-open-settings" role="button" tabindex="0" title="Cliquer pour changer de module ou modifier la date d'examen">
      <div class="module-header-left">
        <div class="module-header-title-row">
          <i data-lucide="book-open" class="module-header-icon"></i>
          <h2 class="module-header-name">${escapeHtml(modTitle)}</h2>
          <span class="module-header-year-pill">${escapeHtml(yearTitle)}</span>
        </div>
        <div class="module-header-date-sub">
          <i data-lucide="calendar" style="width:13px;height:13px;color:var(--text-dim);flex-shrink:0;"></i>
          <span class="module-header-date-text">${dateText}</span>
        </div>
      </div>
      <div class="module-header-right">
        <button type="button" class="btn-change-module-pill">
          <i data-lucide="sliders-horizontal" style="width:13px;height:13px;"></i>
          <span>Changer</span>
        </button>
      </div>
    </div>
  `;

  const headerBtn = document.getElementById('btn-banner-open-settings');
  if (headerBtn) {
    headerBtn.onclick = () => {
      openSettingsModal();
    };
    headerBtn.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openSettingsModal();
      }
    };
  }

  refreshLucide(container);
}

export function openSettingsModal() {
  const keyField = document.getElementById('settings-gemini-key');
  if (keyField) {
    const savedKeys = geminiService.getApiKey();
    keyField.value = savedKeys;
    keyField.classList.add('is-masked');
    updateGeminiKeyCounterBadge(savedKeys);
  }

  const toggleMaskBtn = document.getElementById('btn-toggle-gemini-key-mask');
  if (toggleMaskBtn) {
    toggleMaskBtn.innerHTML = '<i data-lucide="eye" style="width:13px;height:13px;"></i> <span>Afficher les clés</span>';
  }

  const examDateInput = document.getElementById('settings-exam-date');
  const savedDate = getExamDate();
  if (examDateInput) {
    examDateInput.value = savedDate;
    updateSettingsCountdownPreview(savedDate);
  }

  const clinicalModeSelect = document.getElementById('settings-clinical-mode-select');
  if (clinicalModeSelect) {
    const curMode = getClinicalModePreference();
    clinicalModeSelect.value = curMode;
    const badgeEl = document.getElementById('settings-clinical-mode-badge');
    if (badgeEl) badgeEl.textContent = curMode === 'scroll' ? 'Déroulant' : 'Séquentiel';
  }

  updateActiveModuleBadge();
  renderModuleSelectorUI();
  const modals = getDomModals();
  if (modals.settings) {
    modals.settings.style.display = 'flex';
    refreshLucide(modals.settings);
  }
}

export function updateDashboardUI() {
  const metrics = queueEngine.getDashboardMetrics();
  const countdown = getExamCountdownMetrics(metrics.totalIterationsRequired);

  const elRem = document.getElementById('stat-remaining-questions');
  const elIter = document.getElementById('stat-required-iterations');
  const elMast = document.getElementById('stat-mastered-count');
  const elMist = document.getElementById('stat-mistakes-count');
  const elPct = document.getElementById('stat-progress-pct');

  if (elRem) elRem.textContent = formatNumber(metrics.remainingDistinctQuestions);
  if (elIter) elIter.textContent = formatNumber(metrics.totalIterationsRequired);
  if (elMast) elMast.textContent = formatNumber(metrics.masteredCount);
  if (elMist) elMist.textContent = formatNumber(metrics.totalMistakes);
  if (elPct) elPct.textContent = `${metrics.progressPct}%`;

  const badgeCountdown = document.getElementById('badge-exam-countdown');
  if (badgeCountdown) {
    if (countdown.hasDate) {
      if (countdown.isToday) {
        badgeCountdown.textContent = "⏳ Jour J • Examen aujourd'hui";
      } else if (countdown.isExpired) {
        badgeCountdown.textContent = `⏳ Examen passé (+${Math.abs(countdown.daysLeft)} j)`;
      } else {
        badgeCountdown.textContent = `⏳ J-${countdown.daysLeft} • Examen ${countdown.examDateStr}`;
      }
    } else {
      badgeCountdown.textContent = '⏳ Date examen à fixer';
    }
  }

  renderDashboardExamBanner(countdown, metrics);

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

  const remainingDescEl = document.getElementById('stat-remaining-desc');
  if (remainingDescEl) {
    remainingDescEl.textContent = `Questions distinctes à éliminer sur l'ensemble des ${appState.allChapters.length} cours`;
  }

  const iterationsDescEl = document.getElementById('stat-iterations-desc');
  if (iterationsDescEl) {
    if (countdown.hasDate) {
      iterationsDescEl.textContent = `Réponses justes cumulées pour tout nettoyer (programme complet) avant le ${countdown.examDateStr}.`;
    } else {
      iterationsDescEl.textContent = `Réponses justes cumulées pour tout nettoyer (programme complet).`;
    }
  }

  const cadenceWrapEl = document.getElementById('metric-sub-target-cadence');
  if (cadenceWrapEl) {
    cadenceWrapEl.title = countdown.hasDate
      ? `Cadence calculée automatiquement pour éliminer tous les QCM avant le ${countdown.examDateStr}`
      : `Cadence calculée automatiquement pour éliminer tous les QCM avant l'échéance`;
  }

  const chaptersBtnLabel = document.getElementById('btn-chapters-label');
  if (chaptersBtnLabel) {
    if (metrics.selectedChaptersCount === 0 || metrics.selectedChaptersCount === appState.allChapters.length) {
      chaptersBtnLabel.textContent = `Tous les cours (${appState.allChapters.length})`;
    } else {
      chaptersBtnLabel.textContent = `${metrics.selectedChaptersCount} cours sélectionnés (${metrics.queueLength} QCM en file)`;
    }
  }

  const snoozedCount = queueEngine.getSnoozedCountToday();
  const snoozedAlert = document.getElementById('dashboard-snoozed-alert');
  const snoozedText = document.getElementById('dashboard-snoozed-text');
  if (snoozedAlert) {
    if (snoozedCount > 0) {
      snoozedAlert.style.display = 'flex';
      if (snoozedText) {
        snoozedText.textContent = `${snoozedCount} question${snoozedCount > 1 ? 's' : ''} reportée${snoozedCount > 1 ? 's' : ''} à demain`;
      }
    } else {
      snoozedAlert.style.display = 'none';
    }
  }

  const notesCount = queueEngine.getRawReasoningNotes().length;
  const badgeEl = document.getElementById('notebook-count-badge');
  if (badgeEl) badgeEl.textContent = notesCount;
}
