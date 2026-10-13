// PédiaDrill - Application Controller & Orchestration
import { geminiService } from './services/gemini.js';
import { QueueEngine } from './services/queueEngine.js';
import { SyncService } from './services/syncService.js';

// Global Data Access
const allQuestions = window.PEDIA_QUESTIONS || [];
const allChapters = window.PEDIA_CHAPTERS || [];

// Services
const queueEngine = new QueueEngine(allQuestions, allChapters);
const syncService = new SyncService(queueEngine);

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
  refreshLucide();

  // Register Service Worker for offline PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('SW registration:', err);
    });
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
// DASHBOARD RENDERING
// ============================================================================
function updateDashboardUI() {
  const metrics = queueEngine.getDashboardMetrics();

  document.getElementById('stat-remaining-questions').textContent = formatNumber(metrics.remainingDistinctQuestions);
  document.getElementById('stat-required-iterations').textContent = formatNumber(metrics.totalIterationsRequired);
  document.getElementById('stat-mastered-count').textContent = formatNumber(metrics.masteredCount);
  document.getElementById('stat-mistakes-count').textContent = formatNumber(metrics.totalMistakes);
  document.getElementById('stat-progress-pct').textContent = `${metrics.progressPct}%`;
  
  document.getElementById('badge-pool-info').textContent = `Sur ${formatNumber(metrics.totalPoolCount)}`;
  document.getElementById('header-session-code').textContent = syncService.getSessionCode();

  // Chapters label
  const chaptersBtnLabel = document.getElementById('btn-chapters-label');
  if (metrics.selectedChaptersCount === 0 || metrics.selectedChaptersCount === allChapters.length) {
    chaptersBtnLabel.textContent = `Tous les cours (${allChapters.length})`;
  } else {
    chaptersBtnLabel.textContent = `${metrics.selectedChaptersCount} cours sélectionnés`;
  }

  // Notebook badge
  const notesCount = queueEngine.getReasoningNotes().length;
  document.getElementById('notebook-count-badge').textContent = notesCount;
}

function formatNumber(num) {
  return new Intl.NumberFormat('fr-FR').format(num || 0);
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

  // Populate basic error modal fields
  document.getElementById('error-modal-penalty-title').textContent = 
    `Pénalité appliquée : seuil augmenté à ${result.newTarget} réussites requises`;
  document.getElementById('error-modal-penalty-desc').textContent = 
    `Cette question a été ratée (${result.mistakes} faute${result.mistakes > 1 ? 's' : ''}). Elle réapparaîtra très vite (dans ${result.pushDistance} cartes) pour ancrer le bon réflexe.`;

  if (isCroq) {
    document.getElementById('error-modal-user-answer').textContent = `${userAnswerLetters[0]} (Score: ${score}%)`;
    document.getElementById('error-modal-correct-answer').textContent = correctAnswerText;
  } else {
    document.getElementById('error-modal-user-answer').textContent = userAnswerLetters.join(', ') || 'Aucune réponse cochée';
    document.getElementById('error-modal-correct-answer').textContent = correctAnswerText;
  }

  // Show modal immediately
  modals.error.style.display = 'flex';
  const aiNoteContainer = document.getElementById('error-modal-ai-note');
  aiNoteContainer.innerHTML = '<em>Consultation du professeur IA et génération de la note de raisonnement clinique en cours...</em>';

  // Request AI reasoning note asynchronously
  const reasoningObj = await geminiService.generateReasoningNote(
    currentQuestion,
    userAnswerLetters,
    isCroq,
    userAnswerLetters[0] || ''
  );

  aiNoteContainer.textContent = reasoningObj.note;
  document.getElementById('error-modal-model-tag').textContent = reasoningObj.modelUsed;

  // Save to Notebook
  const noteRecord = {
    id: `note_${Date.now()}`,
    questionUid: currentQuestion.uid,
    questionText: currentQuestion.question,
    chapterTitle: currentQuestion.chapterTitle,
    userAnswer: isCroq ? userAnswerLetters[0] : userAnswerLetters.join(', '),
    correctAnswer: correctAnswerText,
    reasoningNote: reasoningObj.note,
    modelUsed: reasoningObj.modelUsed,
    timestamp: Date.now()
  };
  queueEngine.saveReasoningNote(noteRecord);

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
// CARNET DE RAISONNEMENT IA
// ============================================================================
function renderNotebookUI(filterText = '') {
  const container = document.getElementById('notebook-notes-list');
  const allNotes = queueEngine.getReasoningNotes();

  const filtered = allNotes.filter(n => {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    return (n.questionText && n.questionText.toLowerCase().includes(q)) ||
           (n.chapterTitle && n.chapterTitle.toLowerCase().includes(q)) ||
           (n.reasoningNote && n.reasoningNote.toLowerCase().includes(q));
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text-dim);">
        <i data-lucide="book-marked" style="width:36px;height:36px;margin:0 auto 10px;display:block;"></i>
        ${filterText ? 'Aucune note ne correspond à votre recherche.' : 'Aucune note de raisonnement pour le moment. Vos futures erreurs seront automatiquement analysées ici !'}
      </div>
    `;
    refreshLucide();
    return;
  }

  container.innerHTML = '';
  filtered.forEach(note => {
    const card = document.createElement('div');
    card.className = 'note-card';

    const dateStr = note.timestamp 
      ? new Date(note.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';

    card.innerHTML = `
      <div class="note-card-header">
        <span class="note-chapter">${note.chapterTitle || 'Pédiatrie'}</span>
        <span class="note-date">${dateStr}</span>
      </div>
      <div class="note-question">${note.questionText}</div>
      <div style="font-size:0.8rem;color:var(--text-dim);display:flex;gap:12px;">
        <span><strong style="color:var(--rose)">Votre choix :</strong> ${note.userAnswer}</span>
        <span><strong style="color:var(--emerald)">Bonne réponse :</strong> ${note.correctAnswer}</span>
      </div>
      <div class="note-text-body">${note.reasoningNote}</div>
    `;

    container.appendChild(card);
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

  // Notebook search
  document.getElementById('notebook-search-input').oninput = (e) => {
    renderNotebookUI(e.target.value);
  };

  // Chapters modal search
  document.getElementById('chapters-search-input').oninput = (e) => {
    const filter = e.target.value.toLowerCase();
    document.querySelectorAll('.chapter-select-item').forEach(item => {
      const title = item.querySelector('span').textContent.toLowerCase();
      item.style.display = title.includes(filter) ? 'flex' : 'none';
    });
  };

  // Sync Modal
  document.getElementById('btn-open-sync').onclick = () => {
    document.getElementById('sync-session-code-input').value = syncService.getSessionCode();
    document.getElementById('sync-status-msg').textContent = syncService.getLastSyncedText();
    modals.sync.style.display = 'flex';
  };
  document.getElementById('btn-close-sync-modal').onclick = () => modals.sync.style.display = 'none';
  document.getElementById('btn-save-session-code').onclick = () => {
    const val = document.getElementById('sync-session-code-input').value;
    syncService.setSessionCode(val);
    document.getElementById('header-session-code').textContent = syncService.getSessionCode();
    alert('Code de session mis à jour avec succès.');
  };

  document.getElementById('btn-cloud-push').onclick = async () => {
    const statusMsg = document.getElementById('sync-status-msg');
    statusMsg.textContent = 'Envoi vers le Cloud en cours...';
    const res = await syncService.pushToCloud();
    if (res.success) {
      statusMsg.textContent = syncService.getLastSyncedText();
      alert('Progression sauvegardée dans le Cloud avec succès !');
    } else {
      statusMsg.textContent = `Erreur : ${res.error}`;
    }
  };

  document.getElementById('btn-cloud-pull').onclick = async () => {
    const statusMsg = document.getElementById('sync-status-msg');
    statusMsg.textContent = 'Récupération depuis le Cloud en cours...';
    const res = await syncService.pullFromCloud();
    if (res.success) {
      statusMsg.textContent = syncService.getLastSyncedText();
      updateDashboardUI();
      alert('Progression synchronisée depuis le Cloud !');
    } else {
      statusMsg.textContent = `Erreur : ${res.error}`;
    }
  };

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

