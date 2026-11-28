// ============================================================================
// PédiaDrill - Application Controller & Orchestration
// ============================================================================
import { geminiService } from './services/gemini.js';
import { FirebaseSyncService } from './services/firebaseSyncService.js';
import { studyTracker } from './services/studyTracker.js';
import { lessonTracker } from './services/lessonTracker.js';
import { updateService, CURRENT_APP_VERSION } from './services/updateService.js';
import { getActiveModuleId, setExamDate } from './services/moduleCatalog.js';
import {
  isHighlightTranslateEnabled,
  setHighlightTranslateEnabled,
  setHighlightTranslateLang
} from './services/translateService.js';
import {
  initSelectionTranslator,
  closeSelectionTranslatePopover,
  isSelectionTranslatePopoverOpen
} from './utils/selectionTranslator.js';
import {
  appState,
  queueEngine,
  registerViewNavigator,
  registerModuleSwitcher,
  getClinicalModePreference,
  setClinicalModePreference,
  getDomViews,
  getDomModals
} from './state/appState.js';
import { debounce } from './utils/formatters.js';
import {
  refreshLucide,
  showAppToast,
  showConfirmModal,
  resolvePendingConfirmModal
} from './utils/uiDialogs.js';
import {
  updateModalLocalSummary,
  updateGoogleAccountUI,
  setupFirebaseService,
  updateArenaDailyBadge,
  updateSettingsCountdownPreview,
  updateGeminiKeyCounterBadge,
  switchActiveModule,
  openSettingsModal,
  updateDashboardUI
} from './views/dashboardView.js';
import {
  loadAiExplanationsCache,
  scrubCorruptedAiExplanations,
  loadNextArenaQuestion,
  selectOptionByIndex,
  handleSubmitQcm,
  handleSubmitCroq,
  closeErrorModalAndContinue
} from './views/arenaView.js';
import {
  renderNotebookUI,
  setNotebookSortBy,
  toggleNotebookSortOrder,
  setNotebookViewMode,
  setNotebookSelectedChapter,
  openChaptersModal,
  applyChapterSelection
} from './views/notebookView.js';
import {
  renderStatsUI,
  setupStatsEventListeners
} from './views/statsView.js';
import {
  initLessonTracker,
  renderLessonTrackerUI,
  updateLessonTimerTick
} from './views/lessonView.js';

// Instantiate cloud sync service & register globally on appState
export const firebaseSyncService = new FirebaseSyncService(
  queueEngine,
  (status, detail, user, lastSyncText) => {
    updateGoogleAccountUI(status, detail, user, lastSyncText);
  },
  (_mergedState) => {
    updateDashboardUI();
    if (appState.currentView === 'notebook') renderNotebookUI();
    if (appState.currentView === 'stats') renderStatsUI();
    updateArenaDailyBadge();
    updateModalLocalSummary();
    renderLessonTrackerUI();
    updateLessonTimerTick();
    refreshLucide();
  },
  (newRemoteModuleId) => {
    if (!newRemoteModuleId || newRemoteModuleId === getActiveModuleId()) return;
    if (appState.currentView === 'arena' && !appState.isCurrentQuestionAnswered) {
      showAppToast(`📡 Module ${newRemoteModuleId} activé sur un autre appareil.`);
    } else {
      switchActiveModule(newRemoteModuleId, true);
    }
  }
);
appState.firebaseSyncService = firebaseSyncService;

// ============================================================================
// VIEW NAVIGATION
// ============================================================================
export function switchView(viewName) {
  closeSelectionTranslatePopover();
  appState.currentView = viewName;
  const views = getDomViews();
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
    const searchVal = document.getElementById('notebook-search-input')?.value || '';
    renderNotebookUI(searchVal);
  } else if (viewName === 'stats') {
    renderStatsUI();
  }

  const floatingAiBtn = document.getElementById('btn-arena-ai-chat');
  const arenaChatbox = document.getElementById('arena-ai-chatbox');
  if (floatingAiBtn) {
    floatingAiBtn.style.display = (viewName === 'arena') ? 'flex' : 'none';
  }
  if (viewName !== 'arena' && arenaChatbox) {
    arenaChatbox.style.display = 'none';
    if (floatingAiBtn) floatingAiBtn.classList.remove('is-active');
  }

  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  refreshLucide();
}

// ============================================================================
// NATIVE CAPACITOR HARDWARE BACK BUTTON (ANDROID)
// ============================================================================
let isCapacitorBackBound = false;

export function setupNativeCapacitorBackButton() {
  if (isCapacitorBackBound || typeof window === 'undefined') return;
  const capApp = window.Capacitor?.Plugins?.App;
  if (!capApp || typeof capApp.addListener !== 'function') return;

  isCapacitorBackBound = true;
  capApp.addListener('backButton', () => {
    if (isSelectionTranslatePopoverOpen()) {
      closeSelectionTranslatePopover();
      return;
    }

    const confirmModal = document.getElementById('modal-app-confirm');
    if (confirmModal && confirmModal.style.display === 'flex') {
      resolvePendingConfirmModal(false);
      return;
    }

    const lightboxModal = document.getElementById('media-lightbox-modal');
    if (lightboxModal && lightboxModal.style.display === 'flex') {
      window.closeMediaLightbox?.();
      return;
    }

    const chatbox = document.getElementById('arena-ai-chatbox');
    if (chatbox && chatbox.style.display === 'flex') {
      window.toggleArenaChat?.(false);
      return;
    }

    const modals = getDomModals();
    if (modals.clinicalSummary && modals.clinicalSummary.style.display === 'flex') {
      window.closeClinicalCaseSummaryModal?.();
      return;
    }

    if (modals.error && modals.error.style.display === 'flex') {
      closeErrorModalAndContinue();
      return;
    }

    const closeableModals = [modals.chapters, modals.sync, modals.settings, modals.update, modals.manualLesson];
    const openModal = closeableModals.find(m => m && m.style.display === 'flex');
    if (openModal) {
      openModal.style.display = 'none';
      return;
    }

    if (appState.currentView !== 'dashboard') {
      switchView('dashboard');
      return;
    }

    if (typeof capApp.exitApp === 'function') {
      capApp.exitApp();
    }
  });
}

// ============================================================================
// INITIALIZATION
// ============================================================================
export function initApp() {
  registerViewNavigator(switchView);
  registerModuleSwitcher(switchActiveModule);
  window.openSettingsFromAi = openSettingsModal;

  queueEngine.setQuestions(appState.allQuestions, appState.allChapters);
  appState.aiExplanationsCache = loadAiExplanationsCache();
  scrubCorruptedAiExplanations();
  studyTracker.seedFirstPassFromExistingStats(queueEngine.stats, queueEngine.getRawReasoningNotes());
  updateDashboardUI();
  setupEventListeners();
  setupKeyboardShortcuts();
  setupNativeCapacitorBackButton();
  initSelectionTranslator();
  setupFirebaseService();
  initLessonTracker();
  refreshLucide();

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const installingWorker = reg.installing;
        if (installingWorker) {
          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PediaDrill] Nouvelle mise à jour SW prête, rechargement...');
              window.location.reload();
            }
          });
        }
      });
    }).catch(err => {
      console.warn('SW registration:', err);
    });

    let swRefreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!swRefreshing) {
        swRefreshing = true;
        window.location.reload();
      }
    });
  }

  setTimeout(() => {
    if (typeof updateService !== 'undefined' && updateService) {
      updateService.checkForUpdates(false);
    }
  }, 3000);
}

// ============================================================================
// EVENT LISTENERS & KEYBOARD BINDINGS
// ============================================================================
export function setupEventListeners() {
  const modals = getDomModals();

  const bindClick = (id, handler) => {
    const el = document.getElementById(id);
    if (el) el.onclick = handler;
    return el;
  };

  bindClick('btn-home-logo', () => switchView('dashboard'));
  bindClick('btn-leave-arena', () => switchView('dashboard'));
  bindClick('btn-leave-notebook', () => switchView('dashboard'));
  bindClick('btn-leave-stats', () => switchView('dashboard'));
  bindClick('btn-open-notebook', () => switchView('notebook'));
  bindClick('btn-open-notebook-icon', () => switchView('notebook'));
  bindClick('btn-open-stats', () => switchView('stats'));
  bindClick('btn-open-stats-icon', () => switchView('stats'));

  setupStatsEventListeners();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      studyTracker.pauseTimer();
    } else {
      studyTracker.resumeTimer();
    }
  });

  bindClick('btn-start-random', () => {
    if (queueEngine.queue.length === 0 && (!queueEngine.selectedChapterIds || queueEngine.selectedChapterIds.length === 0)) {
      queueEngine.initSession([]);
    }
    switchView('arena');
  });

  bindClick('btn-open-chapters', openChaptersModal);
  bindClick('btn-toggle-all-chapters', () => {
    const items = document.querySelectorAll('.chapter-select-item input');
    const shouldCheck = Array.from(items).some(i => !i.checked);
    items.forEach(i => {
      i.checked = shouldCheck;
      i.closest('.chapter-select-item')?.classList.toggle('checked', shouldCheck);
    });
  });
  bindClick('btn-apply-chapters', applyChapterSelection);
  bindClick('btn-close-chapters-modal', () => {
    if (modals.chapters) modals.chapters.style.display = 'none';
  });

  bindClick('btn-submit-answer', handleSubmitQcm);
  bindClick('btn-submit-croq', handleSubmitCroq);
  bindClick('btn-next-question', () => loadNextArenaQuestion());

  bindClick('btn-history-prev', () => window.navigateHistoryPrev?.());
  bindClick('btn-history-next', () => window.navigateHistoryNext?.());
  bindClick('btn-history-resume-action', () => window.resumeActiveDrill?.());

  bindClick('btn-continue-after-error', closeErrorModalAndContinue);
  bindClick('btn-close-error-modal', closeErrorModalAndContinue);

  const notebookSearchInput = document.getElementById('notebook-search-input');
  if (notebookSearchInput) {
    const debouncedSearch = debounce((val) => renderNotebookUI(val), 200);
    notebookSearchInput.oninput = (e) => debouncedSearch(e.target.value);
  }

  const notebookSortSelect = document.getElementById('notebook-sort-by');
  if (notebookSortSelect) {
    notebookSortSelect.onchange = (e) => {
      setNotebookSortBy(e.target.value);
      renderNotebookUI(notebookSearchInput?.value || '');
    };
  }

  bindClick('btn-toggle-sort-order', () => {
    toggleNotebookSortOrder();
    renderNotebookUI(notebookSearchInput?.value || '');
  });

  const btnViewChapter = document.getElementById('btn-view-mode-chapter');
  const btnViewFlat = document.getElementById('btn-view-mode-flat');
  if (btnViewChapter && btnViewFlat) {
    btnViewChapter.onclick = () => {
      setNotebookViewMode('chapter');
      btnViewChapter.classList.add('active');
      btnViewFlat.classList.remove('active');
      renderNotebookUI(notebookSearchInput?.value || '');
    };
    btnViewFlat.onclick = () => {
      setNotebookViewMode('flat');
      btnViewFlat.classList.add('active');
      btnViewChapter.classList.remove('active');
      renderNotebookUI(notebookSearchInput?.value || '');
    };
  }

  const notebookChapFilter = document.getElementById('notebook-chapter-filter');
  if (notebookChapFilter) {
    notebookChapFilter.onchange = (e) => {
      setNotebookSelectedChapter(e.target.value);
      renderNotebookUI(notebookSearchInput?.value || '');
    };
  }

  const chaptersSearchInput = document.getElementById('chapters-search-input');
  if (chaptersSearchInput) {
    chaptersSearchInput.oninput = (e) => {
      const filter = e.target.value.toLowerCase();
      document.querySelectorAll('.chapter-select-item').forEach(item => {
        const title = item.querySelector('span')?.textContent?.toLowerCase() || '';
        item.style.display = title.includes(filter) ? 'flex' : 'none';
      });
    };
  }

  const openSyncModal = () => {
    updateModalLocalSummary();
    const currentUser = firebaseSyncService.user;
    updateGoogleAccountUI(
      firebaseSyncService.status,
      '',
      currentUser,
      currentUser ? firebaseSyncService.getLastSyncedText() : 'Non connecté'
    );
    if (modals.sync) modals.sync.style.display = 'flex';
  };

  bindClick('btn-header-google-login', openSyncModal);
  bindClick('btn-open-user-profile', openSyncModal);
  bindClick('btn-close-sync-modal', () => {
    if (modals.sync) modals.sync.style.display = 'none';
  });

  const btnModalGoogleLogin = document.getElementById('btn-modal-google-login');
  if (btnModalGoogleLogin) {
    btnModalGoogleLogin.onclick = async () => {
      if (!firebaseSyncService.hasConfig()) {
        const panel = document.getElementById('firebase-config-panel');
        if (panel) panel.style.display = 'flex';
        const chevron = document.getElementById('firebase-chevron');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
        showAppToast('Veuillez renseigner les identifiants de votre projet Firebase dans le panneau ci-dessous pour connecter Google.', { type: 'warning' });
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
        if (appState.currentView === 'notebook') renderNotebookUI(notebookSearchInput?.value || '');
        showAppToast(`✅ Bienvenue ${res.user.displayName || res.user.email} ! Progression synchronisée avec Google.`, { type: 'success' });
      } else if (!res.success && res.error) {
        showAppToast(`❌ ${res.error}`, { type: 'error' });
      }
    };
  }

  const btnGoogleLogout = document.getElementById('btn-google-logout');
  if (btnGoogleLogout) {
    btnGoogleLogout.onclick = async () => {
      const ok = await showConfirmModal({
        title: 'Déconnexion Google',
        message: 'Voulez-vous vous déconnecter de votre compte Google sur cet appareil ? (Vos données locales restent conservées)',
        confirmLabel: 'Se déconnecter',
        isDanger: true
      });
      if (ok) {
        await firebaseSyncService.signOut();
        updateDashboardUI();
        showAppToast('Déconnecté du compte Google.');
      }
    };
  }

  const btnFirestorePush = document.getElementById('btn-firestore-push');
  if (btnFirestorePush) {
    btnFirestorePush.onclick = async () => {
      btnFirestorePush.disabled = true;
      btnFirestorePush.innerHTML = '<span>Sauvegarde vers le Cloud...</span>';
      const res = await firebaseSyncService.pushToFirestore();
      btnFirestorePush.disabled = false;
      btnFirestorePush.innerHTML = '<i data-lucide="upload-cloud"></i> <span>📤 Envoyer au Cloud</span>';
      refreshLucide(btnFirestorePush);
      updateModalLocalSummary();
      if (res.success) {
        showAppToast('✅ Progression & notes de raisonnement sauvegardées sur Google Cloud !', { type: 'success' });
      } else {
        showAppToast('❌ ' + (res.error || 'Échec de sauvegarde'), { type: 'error' });
      }
    };
  }

  const btnFirestorePull = document.getElementById('btn-firestore-pull');
  if (btnFirestorePull) {
    btnFirestorePull.onclick = async () => {
      btnFirestorePull.disabled = true;
      btnFirestorePull.innerHTML = '<span>Récupération du Cloud...</span>';
      const res = await firebaseSyncService.pullFromFirestore();
      btnFirestorePull.disabled = false;
      btnFirestorePull.innerHTML = '<i data-lucide="download-cloud"></i> <span>📥 Récupérer du Cloud</span>';
      refreshLucide(btnFirestorePull);
      updateModalLocalSummary();
      if (res.success) {
        updateDashboardUI();
        if (appState.currentView === 'notebook') renderNotebookUI(notebookSearchInput?.value || '');
        showAppToast('✅ Progression et notes récupérées et fusionnées avec succès depuis Google Cloud !', { type: 'success' });
      } else {
        showAppToast('❌ ' + (res.error || 'Échec de récupération'), { type: 'error' });
      }
    };
  }

  bindClick('btn-toggle-firebase-config', () => {
    const panel = document.getElementById('firebase-config-panel');
    if (!panel) return;
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'flex' : 'none';
    const chevron = document.getElementById('firebase-chevron');
    if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'none';
  });

  bindClick('btn-save-firebase-config', () => {
    const config = {
      apiKey: document.getElementById('fb-api-key')?.value?.trim() || '',
      projectId: document.getElementById('fb-project-id')?.value?.trim() || '',
      authDomain: document.getElementById('fb-auth-domain')?.value?.trim() || '',
      appId: document.getElementById('fb-app-id')?.value?.trim() || ''
    };

    if (!config.apiKey || !config.projectId) {
      showAppToast("Veuillez renseigner au minimum la clé API et l'ID de projet Firebase.", { type: 'warning' });
      return;
    }

    firebaseSyncService.saveConfig(config);
    showAppToast('✅ Configuration Firebase enregistrée et initialisée ! Vous pouvez maintenant vous connecter avec Google.', { type: 'success' });
  });

  bindClick('btn-export-json', () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(queueEngine.exportState());
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `pediadrile_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  });

  bindClick('btn-import-json', () => {
    document.getElementById('file-import-input')?.click();
  });

  const fileImportInput = document.getElementById('file-import-input');
  if (fileImportInput) {
    fileImportInput.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const ok = queueEngine.importState(event.target.result);
        if (ok) {
          updateDashboardUI();
          showAppToast('✅ Progression importée avec succès !', { type: 'success' });
          if (modals.sync) modals.sync.style.display = 'none';
        } else {
          showAppToast('❌ Fichier JSON invalide.', { type: 'error' });
        }
      };
      reader.readAsText(file);
    };
  }

  const versionBadgeEl = document.getElementById('settings-current-app-version');
  if (versionBadgeEl && typeof CURRENT_APP_VERSION !== 'undefined') {
    versionBadgeEl.textContent = `v${CURRENT_APP_VERSION}`;
  }

  bindClick('btn-open-settings', openSettingsModal);
  bindClick('btn-close-settings-modal', () => {
    if (modals.settings) modals.settings.style.display = 'none';
  });

  const geminiKeyInput = document.getElementById('settings-gemini-key');
  if (geminiKeyInput) {
    geminiKeyInput.oninput = (e) => updateGeminiKeyCounterBadge(e.target.value);
  }

  const toggleMaskBtn = document.getElementById('btn-toggle-gemini-key-mask');
  if (toggleMaskBtn && geminiKeyInput) {
    toggleMaskBtn.onclick = () => {
      const masked = geminiKeyInput.classList.toggle('is-masked');
      toggleMaskBtn.innerHTML = masked
        ? '<i data-lucide="eye" style="width:13px;height:13px;"></i> <span>Afficher les clés</span>'
        : '<i data-lucide="eye-off" style="width:13px;height:13px;"></i> <span>Masquer les clés</span>';
      refreshLucide(toggleMaskBtn);
    };
  }

  const examDateInput = document.getElementById('settings-exam-date');
  if (examDateInput) {
    examDateInput.oninput = (e) => updateSettingsCountdownPreview(e.target.value);
  }

  bindClick('btn-clear-exam-date', () => {
    if (examDateInput) examDateInput.value = '';
    updateSettingsCountdownPreview('');
  });

  const clinicalModeSelect = document.getElementById('settings-clinical-mode-select');
  if (clinicalModeSelect) {
    clinicalModeSelect.onchange = (e) => {
      setClinicalModePreference(e.target.value);
    };
  }

  const translateToggleBtn = document.getElementById('btn-toggle-translate-enabled');
  if (translateToggleBtn) {
    translateToggleBtn.onclick = () => {
      const nextState = !isHighlightTranslateEnabled();
      setHighlightTranslateEnabled(nextState);
      if (!nextState) {
        closeSelectionTranslatePopover();
      }
      try {
        localStorage.setItem('pedia_settings_updated_at', String(Date.now()));
      } catch {}
      firebaseSyncService.pushProfileToFirestore();
      showAppToast(
        nextState
          ? '🌐 Traduction au surlignage activée.'
          : '🔇 Traduction au surlignage désactivée.',
        { type: nextState ? 'success' : 'info', durationMs: 2200 }
      );
    };
  }

  const translateLangSelect = document.getElementById('settings-translate-lang');
  if (translateLangSelect) {
    translateLangSelect.onchange = (e) => {
      setHighlightTranslateLang(e.target.value);
    };
  }

  bindClick('btn-save-settings', () => {
    const rawKeyInput = document.getElementById('settings-gemini-key')?.value?.trim() || '';
    geminiService.setApiKey(rawKeyInput);
    updateGeminiKeyCounterBadge(rawKeyInput);

    if (examDateInput) {
      setExamDate(examDateInput.value);
    }

    if (clinicalModeSelect) {
      setClinicalModePreference(clinicalModeSelect.value);
    } else {
      getClinicalModePreference();
    }

    if (translateLangSelect) {
      setHighlightTranslateLang(translateLangSelect.value);
    }
    setHighlightTranslateEnabled(isHighlightTranslateEnabled());

    try {
      localStorage.setItem('pedia_settings_updated_at', String(Date.now()));
    } catch {}

    firebaseSyncService.pushProfileToFirestore();

    const keyCount = geminiService.getKeyCount();
    const keyInfo = keyCount > 0 ? `${keyCount} clé${keyCount > 1 ? 's' : ''} Gemini` : 'Aucune clé Gemini';
    showAppToast(`✅ Paramètres enregistrés (${keyInfo}) !`, { type: 'success' });
    if (modals.settings) modals.settings.style.display = 'none';

    updateDashboardUI();
    updateArenaDailyBadge();
    if (appState.currentView === 'stats') renderStatsUI();
  });

  bindClick('btn-check-updates-manual', () => {
    updateService?.checkForUpdates(true);
  });

  bindClick('btn-close-update-modal', () => {
    if (updateService) updateService.closeUpdateModal();
    else if (modals.update) modals.update.style.display = 'none';
  });

  bindClick('btn-update-later', () => {
    if (updateService) updateService.closeUpdateModal();
    else if (modals.update) modals.update.style.display = 'none';
  });

  window.onclick = (e) => {
    const mMap = getDomModals();
    [mMap.error, mMap.chapters, mMap.sync, mMap.settings, mMap.update].forEach(m => {
      if (m && e.target === m) m.style.display = 'none';
    });
  };
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================
export function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    const confirmModal = document.getElementById('modal-app-confirm');
    if (confirmModal && confirmModal.style.display === 'flex') {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolvePendingConfirmModal(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        resolvePendingConfirmModal(true);
      }
      return;
    }

    const lightboxModal = document.getElementById('media-lightbox-modal');
    if (lightboxModal && lightboxModal.style.display === 'flex') {
      if (e.key === 'Escape') {
        e.preventDefault();
        window.closeMediaLightbox?.();
        return;
      }
    }

    const modals = getDomModals();
    if (modals.error && modals.error.style.display === 'flex') {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        closeErrorModalAndContinue();
      }
      return;
    }

    if (modals.clinicalSummary && modals.clinicalSummary.style.display === 'flex') {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        window.closeClinicalCaseSummaryModal?.();
      }
      return;
    }

    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
      return;
    }

    if (appState.currentView === 'arena') {
      if (appState.isClinicalRunActive && appState.clinicalRunState && appState.clinicalRunState.mode === 'sequential') {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          window.navClinicalSequentialStep?.(-1);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          window.navClinicalSequentialStep?.(1);
          return;
        }
      }

      if (e.key === 'ArrowLeft') {
        if (appState.answeredHistory.length > 0 && appState.historyCursor < appState.answeredHistory.length - 1) {
          e.preventDefault();
          window.navigateHistoryPrev?.();
          return;
        }
      } else if (e.key === 'ArrowRight') {
        if (appState.historyCursor >= 0) {
          e.preventDefault();
          window.navigateHistoryNext?.();
          return;
        }
      }

      if (appState.historyCursor >= 0) {
        if (e.key === 'Enter') {
          e.preventDefault();
          window.resumeActiveDrill?.();
        }
        return;
      }

      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        selectOptionByIndex(parseInt(e.key, 10) - 1);
      } else if (['a', 'b', 'c', 'd', 'e'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        const idx = e.key.toLowerCase().charCodeAt(0) - 97;
        selectOptionByIndex(idx);
      } else if (e.key === 's' || e.key === 'S') {
        if (!appState.isCurrentQuestionAnswered) {
          e.preventDefault();
          window.snoozeCurrentQuestionForToday?.();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const successBanner = document.getElementById('arena-success-banner');
        const submitBtn = document.getElementById('btn-submit-answer');
        if (successBanner && successBanner.style.display === 'flex') {
          loadNextArenaQuestion();
        } else if (submitBtn && !submitBtn.disabled) {
          handleSubmitQcm();
        }
      }
    }
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
