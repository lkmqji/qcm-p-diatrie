// ============================================================================
// Cas Cliniques & Moteur de Résolution Complète (Séquentiel & Déroulant)
// ============================================================================
import {
  appState,
  queueEngine,
  getEffectiveArenaQuestion,
  getClinicalModePreference,
  setClinicalModePreference
} from '../state/appState.js';
import { geminiService, resolveAiModuleContext } from '../services/gemini.js';
import { studyTracker } from '../services/studyTracker.js';
import {
  escapeHtml,
  parseMarkdownInline,
  formatMedicalContent,
  formatReasoningNote
} from '../utils/formatters.js';
import {
  refreshLucide,
  triggerMasteryConfetti,
  showAppToast,
  showConfirmModal
} from '../utils/uiDialogs.js';
import { updateArenaDailyBadge } from './dashboardView.js';
import { renderStatsUI } from './statsView.js';
import {
  renderQuestionMedia,
  getSavedAiExplanation,
  saveAiExplanationForQuestion,
  getAiCacheKey,
  renderArenaAiExplanation,
  renderOptionsList,
  loadNextArenaQuestion
} from './arenaView.js';

export function getClinicalCaseSubQuestions(question) {
  if (!question || !question.clinical_case || !question.clinical_case.trim()) {
    return [];
  }
  const idStr = String(question.id || '');
  const idParts = idStr.split('.');
  const casePrefix = idParts.length > 1 ? idParts[0] : null;

  return appState.allQuestions.filter(item => {
    if (!item.clinical_case || !item.clinical_case.trim()) return false;
    if (question.chapterId && item.chapterId !== question.chapterId) return false;
    if (casePrefix) {
      const parts = String(item.id || '').split('.');
      if (parts[0] === casePrefix) return true;
    }
    return item.clinical_case.trim() === question.clinical_case.trim();
  }).sort((a, b) => {
    const aParts = String(a.id || '').split('.');
    const bParts = String(b.id || '').split('.');
    const aIdx = parseInt(aParts[1] || a.id, 10) || 0;
    const bIdx = parseInt(bParts[1] || b.id, 10) || 0;
    return aIdx - bIdx;
  });
}

export function buildClinicalCaseContext(question) {
  if (!question) return null;

  const isCase = (appState.isClinicalRunActive && appState.clinicalRunState) || (question.clinical_case && question.clinical_case.trim().length > 0);
  if (!isCase) return null;

  const caseStatement = (appState.clinicalRunState ? appState.clinicalRunState.caseStatement : question.clinical_case) || '';
  const subQuestions = (appState.clinicalRunState ? appState.clinicalRunState.subQuestions : getClinicalCaseSubQuestions(question)) || [];

  if (subQuestions.length === 0) {
    return {
      isClinicalCase: true,
      casePrefix: String(question.id || '').split('.')[0] || '',
      caseStatement,
      currentNum: 1,
      totalCount: 1,
      chronologySummary: `Énoncé du cas clinique :\n"${caseStatement}"`
    };
  }

  let curIdx = 0;
  if (appState.isClinicalRunActive && appState.clinicalRunState) {
    curIdx = appState.clinicalRunState.currentIndex;
  } else {
    const found = subQuestions.findIndex(sq => sq.uid === question.uid || sq.id === question.id);
    curIdx = found !== -1 ? found : 0;
  }

  const curNum = curIdx + 1;
  const totalCount = subQuestions.length;
  const casePrefix = appState.clinicalRunState ? appState.clinicalRunState.casePrefix : (String(question.id || '').split('.')[0] || '');

  const questionsUpToCurrent = subQuestions.slice(0, curIdx + 1);

  const lines = [];
  questionsUpToCurrent.forEach((sq, idx) => {
    const qNum = idx + 1;
    const isCurrent = idx === curIdx;
    const tag = isCurrent ? "➡️ [QUESTION ACTUELLE OÙ SE TROUVE L'ÉTUDIANT]" : `[Question ${qNum}/${totalCount}]`;
    const qStatement = sq.question || sq.statement || '';

    let userAnsText = 'Non renseignée';
    if (appState.clinicalRunState && appState.clinicalRunState.userAnswers && appState.clinicalRunState.userAnswers[sq.uid]) {
      const uAns = appState.clinicalRunState.userAnswers[sq.uid];
      userAnsText = uAns.isCroq ? (uAns.croqText || 'Vide') : (uAns.selectedLetters?.join(', ') || 'Vide');
    }

    const evalData = (appState.clinicalRunState && appState.clinicalRunState.cardEvaluations) ? appState.clinicalRunState.cardEvaluations[sq.uid] : null;

    let correctText = '';
    if (sq.is_croq) {
      correctText = sq.croq_answer || 'Réponse attendue';
    } else {
      const corOpts = (sq.options || []).filter(o => o.is_correct);
      correctText = corOpts.map(o => `${o.letter}) ${o.text}`).join(' ; ') || corOpts.map(o => o.letter).join(', ');
    }

    let optsText = '';
    if (!sq.is_croq && sq.options && sq.options.length > 0) {
      optsText = sq.options.map(o => `   ${o.letter}) ${o.text}`).join('\n');
    }

    const savedAi = getSavedAiExplanation(sq.uid, sq);
    let expText = 'Non fournie dans la base';
    if (sq.explanation && sq.explanation.trim()) {
      expText = sq.explanation.trim();
    } else if (savedAi && savedAi.note) {
      expText = `[Explication IA Flash générée] : ${savedAi.note.slice(0, 250)}...`;
    }

    lines.push(`
--- ${tag} : Question ${qNum} sur ${totalCount} ---
Énoncé : ${qStatement}
${optsText ? `Propositions :\n${optsText}` : 'Type : Question ouverte (CROQ)'}
${userAnsText !== 'Non renseignée' ? `Réponse fournie par l'étudiant : ${userAnsText} ${evalData ? (evalData.isCorrect ? '(Validée ✅)' : '(Inexacte ❌)') : ''}` : ''}
Bonne(s) réponse(s) officielle(s) : ${correctText}
Explication : ${expText}
`);
  });

  if (curIdx + 1 < totalCount) {
    lines.push(`\n[Note pédagogique : Le cas comporte ${totalCount} questions au total. L'étudiant est actuellement à l'étape ${curNum}/${totalCount}. Ne spoile pas les questions suivantes ${curNum + 1} à ${totalCount} sauf si l'étudiant pose une question directe sur la stratégie thérapeutique globale.]`);
  }

  return {
    isClinicalCase: true,
    casePrefix,
    caseStatement,
    currentNum: curNum,
    totalCount,
    chronologySummary: lines.join('\n')
  };
}

export function updateClinicalUncleanedBadge(qOrSubQuestions) {
  const badge = document.getElementById('clinical-uncleaned-badge');
  const badgeText = document.getElementById('clinical-uncleaned-text');
  if (!badge || !badgeText) return;

  const subQuestions = Array.isArray(qOrSubQuestions)
    ? qOrSubQuestions
    : getClinicalCaseSubQuestions(qOrSubQuestions);
  const totalCount = subQuestions.length;

  if (totalCount > 1 && !appState.isClinicalRunActive) {
    const uncleanedCount = subQuestions.filter(sq => !(queueEngine?.stats?.[sq.uid]?.done)).length;
    badgeText.textContent = `${uncleanedCount}/${totalCount} à nettoyer`;
    badge.classList.toggle('is-all-cleaned', uncleanedCount === 0);
    badge.title = uncleanedCount === 0
      ? `Toutes les questions de ce cas clinique sont nettoyées (0/${totalCount} restante)`
      : `${uncleanedCount} question(s) pas encore nettoyée(s) sur ${totalCount} au total dans ce cas clinique`;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

export function updateClinicalCaseUI(q) {
  const clinicalBox = document.getElementById('arena-clinical-case');
  const clinicalText = document.getElementById('arena-clinical-case-text');
  const subBadge = document.getElementById('arena-subquestion-badge');
  const subBadgeText = document.getElementById('arena-subquestion-badge-text');
  const btnAccordion = document.getElementById('btn-toggle-clinical-questions');
  const btnAccordionText = document.getElementById('btn-toggle-clinical-text');
  const accordionContainer = document.getElementById('arena-clinical-questions-accordion');

  appState.isClinicalAccordionOpen = false;
  if (btnAccordion) btnAccordion.classList.remove('is-open');
  if (accordionContainer) {
    accordionContainer.style.display = 'none';
    accordionContainer.innerHTML = '';
  }

  if (q && q.clinical_case && q.clinical_case.trim()) {
    if (clinicalText) clinicalText.innerHTML = formatMedicalContent(q.clinical_case.trim());
    if (clinicalBox) clinicalBox.style.display = 'block';

    const subQuestions = getClinicalCaseSubQuestions(q);
    const totalCount = subQuestions.length;

    const idParts = String(q.id || '').split('.');
    const caseNum = idParts.length > 1 ? idParts[0] : null;
    let subIdx = idParts.length > 1 ? parseInt(idParts[1], 10) : null;

    if ((subIdx === null || isNaN(subIdx)) && totalCount > 0) {
      const foundIdx = subQuestions.findIndex(sq => sq.uid === q.uid || sq.id === q.id);
      if (foundIdx !== -1) subIdx = foundIdx + 1;
    }

    if (subBadge && subBadgeText) {
      if (subIdx !== null && totalCount > 0) {
        const caseLabel = caseNum ? `Cas Clinique ${caseNum}` : 'Cas Clinique';
        subBadgeText.textContent = `${caseLabel} • Question ${subIdx}/${totalCount}`;
        subBadge.style.display = 'inline-flex';
      } else if (caseNum) {
        subBadgeText.textContent = `Cas Clinique ${caseNum}`;
        subBadge.style.display = 'inline-flex';
      } else {
        subBadge.style.display = 'none';
      }
    }

    if (btnAccordion && btnAccordionText) {
      if (totalCount > 1) {
        btnAccordion.style.display = 'inline-flex';
        btnAccordionText.textContent = `Voir les ${totalCount} questions du cas`;
      } else {
        btnAccordion.style.display = 'none';
      }
    }

    const btnStartCase = document.getElementById('btn-start-clinical-case');
    const btnStartCaseText = document.getElementById('btn-start-clinical-text');
    if (btnStartCase && btnStartCaseText) {
      if (totalCount > 1 && !appState.isClinicalRunActive) {
        btnStartCase.style.display = 'inline-flex';
        btnStartCaseText.textContent = `Résoudre le cas complet (${totalCount} Q)`;
      } else {
        btnStartCase.style.display = 'none';
      }
    }
    updateClinicalUncleanedBadge(subQuestions);
  } else {
    if (clinicalBox) clinicalBox.style.display = 'none';
    if (subBadge) subBadge.style.display = 'none';
    if (btnAccordion) btnAccordion.style.display = 'none';
    const btnStartCase = document.getElementById('btn-start-clinical-case');
    if (btnStartCase) btnStartCase.style.display = 'none';
    const uncleanedBadge = document.getElementById('clinical-uncleaned-badge');
    if (uncleanedBadge) uncleanedBadge.style.display = 'none';
  }
}

window.toggleClinicalQuestionsAccordion = function() {
  const currentQ = getEffectiveArenaQuestion();
  if (!currentQ || !currentQ.clinical_case) return;

  const accordionContainer = document.getElementById('arena-clinical-questions-accordion');
  const btnAccordion = document.getElementById('btn-toggle-clinical-questions');
  const btnAccordionText = document.getElementById('btn-toggle-clinical-text');
  if (!accordionContainer) return;

  appState.isClinicalAccordionOpen = !appState.isClinicalAccordionOpen;

  if (appState.isClinicalAccordionOpen) {
    const subQuestions = getClinicalCaseSubQuestions(currentQ);
    const totalCount = subQuestions.length;

    if (btnAccordion) btnAccordion.classList.add('is-open');
    if (btnAccordionText) btnAccordionText.textContent = `Masquer les questions (${totalCount})`;

    let html = '';
    subQuestions.forEach((sq, idx) => {
      const isCurrent = (sq.uid === currentQ.uid || sq.id === currentQ.id);
      const qNum = idx + 1;
      const opts = sq.options || [];

      let optionsHtml = '';
      if (sq.is_croq) {
        optionsHtml = `
          <div class="clinical-accordion-opt">
            <span class="clinical-accordion-opt-letter">📝</span>
            <span style="font-style:italic;color:var(--cyan);">Question à Réponse Ouverte et Courte (CROQ)</span>
          </div>
        `;
      } else if (opts.length > 0) {
        optionsHtml = `
          <div class="clinical-accordion-options">
            ${opts.map((opt, oIdx) => {
              const letter = opt.letter || String.fromCharCode(65 + oIdx);
              return `
                <div class="clinical-accordion-opt">
                  <span class="clinical-accordion-opt-letter">${escapeHtml(letter)}.</span>
                  <span class="clinical-accordion-opt-text">${parseMarkdownInline(opt.text || '')}</span>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      html += `
        <div class="clinical-accordion-item ${isCurrent ? 'is-current' : ''}">
          <div class="clinical-accordion-header">
            <span class="clinical-accordion-qnum">
              <i data-lucide="help-circle" style="width:13px;height:13px;"></i>
              Question ${qNum} / ${totalCount}
            </span>
            ${isCurrent ? '<span class="clinical-accordion-tag-current">Question en cours</span>' : ''}
          </div>
          <div class="clinical-accordion-text">
            ${formatMedicalContent(sq.question || sq.statement)}
          </div>
          ${optionsHtml}
        </div>
      `;
    });

    accordionContainer.innerHTML = html;
    accordionContainer.style.display = 'flex';
    refreshLucide(accordionContainer);
  } else {
    const subQuestions = getClinicalCaseSubQuestions(currentQ);
    if (btnAccordion) btnAccordion.classList.remove('is-open');
    if (btnAccordionText) btnAccordionText.textContent = `Voir les ${subQuestions.length} questions du cas`;
    accordionContainer.style.display = 'none';
    accordionContainer.innerHTML = '';
  }
};

export function updateClinicalRunBarUI() {
  const bar = document.getElementById('arena-clinical-run-bar');
  const track = document.getElementById('arena-clinical-progress-track');
  const fill = document.getElementById('arena-clinical-progress-fill');
  const titleText = document.getElementById('clinical-run-title-text');
  const counterText = document.getElementById('clinical-run-step-counter');
  const btnSeq = document.getElementById('btn-mode-sequential');
  const btnScroll = document.getElementById('btn-mode-scroll');
  const btnStartCase = document.getElementById('btn-start-clinical-case');
  const btnSnooze = document.getElementById('btn-snooze-question');

  if (!appState.isClinicalRunActive || !appState.clinicalRunState) {
    if (bar) bar.style.display = 'none';
    if (track) track.style.display = 'none';
    if (btnSnooze) btnSnooze.style.display = 'inline-flex';
    return;
  }

  if (bar) bar.style.display = 'flex';
  if (track) track.style.display = 'block';
  if (btnStartCase) btnStartCase.style.display = 'none';
  const uncleanedBadge = document.getElementById('clinical-uncleaned-badge');
  if (uncleanedBadge) uncleanedBadge.style.display = 'none';
  if (btnSnooze) btnSnooze.style.display = 'none';

  const runState = appState.clinicalRunState;
  const total = runState.subQuestions.length;
  if (titleText) {
    titleText.textContent = `Cas Clinique ${runState.casePrefix} (${total} Q)`;
  }

  if (btnSeq && btnScroll) {
    btnSeq.classList.toggle('active', runState.mode === 'sequential');
    btnScroll.classList.toggle('active', runState.mode === 'scroll');
  }

  if (runState.mode === 'sequential') {
    const cur = runState.currentIndex + 1;
    if (counterText) counterText.textContent = `Question ${cur} / ${total}`;
    const pct = Math.round((cur / total) * 100);
    if (fill) fill.style.width = `${pct}%`;
  } else {
    const answeredCount = Object.keys(runState.userAnswers).length;
    if (counterText) counterText.textContent = `${answeredCount} / ${total} répondue(s)`;
    const pct = Math.round((answeredCount / total) * 100);
    if (fill) fill.style.width = `${pct}%`;
  }

  refreshLucide(bar);
}

window.startClinicalCaseRun = function() {
  const currentQ = getEffectiveArenaQuestion();
  if (!currentQ || !currentQ.clinical_case) return;

  const subQuestions = getClinicalCaseSubQuestions(currentQ);
  if (!subQuestions || subQuestions.length === 0) return;

  const idParts = String(currentQ.id || '').split('.');
  const casePrefix = idParts.length > 1 ? idParts[0] : (currentQ.id || '1');

  appState.isClinicalAccordionOpen = false;
  const accordionContainer = document.getElementById('arena-clinical-questions-accordion');
  const btnAccordion = document.getElementById('btn-toggle-clinical-questions');
  if (btnAccordion) btnAccordion.classList.remove('is-open');
  if (accordionContainer) accordionContainer.style.display = 'none';

  const preferredMode = getClinicalModePreference();
  const modCtx = resolveAiModuleContext(currentQ);
  appState.isClinicalRunActive = true;
  appState.clinicalRunState = {
    casePrefix,
    caseStatement: currentQ.clinical_case.trim(),
    chapterId: currentQ.chapterId || null,
    chapterTitle: currentQ.chapterTitle || modCtx.defaultChapter,
    subQuestions,
    currentIndex: 0,
    mode: preferredMode,
    userAnswers: {},
    cardEvaluations: {},
    startTime: Date.now()
  };

  if (appState.selectedOptionIds.size > 0 && appState.currentQuestion) {
    const letters = [];
    document.querySelectorAll('.option-item.selected').forEach(el => {
      letters.push(el.dataset.letter);
    });
    if (letters.length > 0) {
      appState.clinicalRunState.userAnswers[appState.currentQuestion.uid] = {
        selectedLetters: letters.sort(),
        isCroq: false,
        croqText: ''
      };
    }
  }

  updateClinicalRunBarUI();

  if (appState.clinicalRunState.mode === 'scroll') {
    renderClinicalScrollView();
  } else {
    renderClinicalSequentialView();
  }

  const arenaEl = document.getElementById('view-arena');
  if (arenaEl) arenaEl.scrollIntoView({ behavior: 'auto', block: 'start' });
};

window.switchClinicalRunMode = function(newMode) {
  if (!appState.isClinicalRunActive || !appState.clinicalRunState) return;
  if (appState.clinicalRunState.mode === newMode) return;

  if (appState.clinicalRunState.mode === 'sequential') {
    saveSequentialCurrentQuestionState();
  }

  appState.clinicalRunState.mode = newMode;
  setClinicalModePreference(newMode);
  updateClinicalRunBarUI();

  if (newMode === 'scroll') {
    renderClinicalScrollView();
  } else {
    renderClinicalSequentialView();
  }
};

export function saveSequentialCurrentQuestionState() {
  const runState = appState.clinicalRunState;
  if (!runState) return;
  const subQ = runState.subQuestions[runState.currentIndex];
  if (!subQ) return;

  if (subQ.is_croq) {
    const val = document.getElementById('arena-croq-input')?.value?.trim() || '';
    if (val) {
      runState.userAnswers[subQ.uid] = {
        selectedLetters: [],
        isCroq: true,
        croqText: val
      };
    }
  } else {
    const letters = [];
    document.querySelectorAll('.option-item.selected').forEach(el => {
      letters.push(el.dataset.letter);
    });
    if (letters.length > 0) {
      runState.userAnswers[subQ.uid] = {
        selectedLetters: letters.sort(),
        isCroq: false,
        croqText: ''
      };
    }
  }
}

function updateSequentialActionButtons(curNum, total) {
  const defaultActions = document.getElementById('arena-default-actions');
  const runState = appState.clinicalRunState;
  if (!defaultActions || !runState) return;

  let stepperBar = document.getElementById('arena-clinical-sequential-stepper');
  if (!stepperBar) {
    stepperBar = document.createElement('div');
    stepperBar.id = 'arena-clinical-sequential-stepper';
    stepperBar.className = 'clinical-sequential-stepper-wrap';
    stepperBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;width:100%;';
    defaultActions.parentNode.insertBefore(stepperBar, defaultActions);
  }
  stepperBar.style.display = 'flex';

  const isFirst = curNum === 1;
  const isLast = curNum === total;

  stepperBar.innerHTML = `
    <button type="button" class="btn-secondary" id="btn-clinical-prev-q" style="padding:8px 16px;font-size:0.78rem;gap:6px;" ${isFirst ? 'disabled' : ''} onclick="window.navClinicalSequentialStep(-1)">
      <i data-lucide="chevron-left" style="width:14px;height:14px;"></i>
      <span>Précédente</span>
    </button>
    <div style="font-size:0.8rem;font-weight:700;color:var(--text-muted);font-family:var(--font-heading);">
      ${curNum} / ${total}
    </div>
    <button type="button" class="btn-secondary" id="btn-clinical-next-q" style="padding:8px 16px;font-size:0.78rem;gap:6px;" ${isLast ? 'disabled' : ''} onclick="window.navClinicalSequentialStep(1)">
      <span>Suivante</span>
      <i data-lucide="chevron-right" style="width:14px;height:14px;"></i>
    </button>
  `;

  const subQ = runState.subQuestions[runState.currentIndex];
  const evalData = runState.cardEvaluations ? runState.cardEvaluations[subQ?.uid] : null;
  const isAlreadyEvaluated = !!evalData;

  const btnSubmitAnswer = document.getElementById('btn-submit-answer');
  const btnSubmitCroq = document.getElementById('btn-submit-croq');
  const btnClinicalSave = document.getElementById('btn-clinical-save-next');
  const btnClinicalSaveText = document.getElementById('btn-clinical-save-text');

  if (btnClinicalSave) {
    if (isAlreadyEvaluated) {
      btnClinicalSave.style.display = 'none';
    } else {
      btnClinicalSave.style.display = 'inline-flex';
      const saveText = isLast ? 'Enregistrer & Bilan' : 'Enregistrer & Suivant';
      if (btnClinicalSaveText) btnClinicalSaveText.textContent = saveText;
      btnClinicalSave.title = isLast ? 'Enregistrer sans corriger et voir le bilan' : 'Enregistrer sans corriger et passer à la suivante';

      if (subQ?.is_croq) {
        const croqVal = document.getElementById('arena-croq-input')?.value?.trim() || '';
        btnClinicalSave.disabled = !croqVal;
      } else {
        btnClinicalSave.disabled = appState.selectedOptionIds.size === 0;
      }
    }
  }

  if (isAlreadyEvaluated) {
    const nextBtnText = isLast ? '🏁 Voir le Bilan Final' : 'Question suivante ➔';
    if (btnSubmitAnswer) {
      const span = btnSubmitAnswer.querySelector('span');
      if (span) span.textContent = nextBtnText;
      btnSubmitAnswer.disabled = false;
    }
    if (btnSubmitCroq) {
      const span = btnSubmitCroq.querySelector('span');
      if (span) span.textContent = nextBtnText;
      btnSubmitCroq.disabled = false;
    }
  } else {
    if (btnSubmitAnswer) {
      const span = btnSubmitAnswer.querySelector('span');
      if (span) span.textContent = 'Vérifier la réponse';
      btnSubmitAnswer.disabled = appState.selectedOptionIds.size === 0;
    }
    if (btnSubmitCroq) {
      const span = btnSubmitCroq.querySelector('span');
      if (span) span.textContent = 'Évaluer par IA (Gemini)';
      const croqVal = document.getElementById('arena-croq-input')?.value?.trim() || '';
      btnSubmitCroq.disabled = !croqVal;
    }
  }

  refreshLucide(stepperBar);
  if (btnClinicalSave) refreshLucide(btnClinicalSave);
}

window.navClinicalSequentialStep = function(delta) {
  if (!appState.isClinicalRunActive || !appState.clinicalRunState) return;
  saveSequentialCurrentQuestionState();
  const nextIdx = appState.clinicalRunState.currentIndex + delta;
  if (nextIdx >= 0 && nextIdx < appState.clinicalRunState.subQuestions.length) {
    appState.clinicalRunState.currentIndex = nextIdx;
    renderClinicalSequentialView();
  }
};

window.saveAndAdvanceSequentialClinicalQuestion = function() {
  if (!appState.isClinicalRunActive || !appState.clinicalRunState || appState.clinicalRunState.mode !== 'sequential') return;
  saveSequentialCurrentQuestionState();

  const isLast = appState.clinicalRunState.currentIndex === appState.clinicalRunState.subQuestions.length - 1;
  if (isLast) {
    window.validateAllClinicalSubQuestions();
  } else {
    appState.clinicalRunState.currentIndex++;
    renderClinicalSequentialView();
  }
};

function renderClinicalExplanationArea(subQ, isCorrect, correctLettersStr = '') {
  const expBox = document.getElementById('arena-explanation-box');
  const expText = document.getElementById('arena-explanation-text');
  if (!expBox || !expText) return;

  const correctStr = correctLettersStr || (subQ.is_croq ? subQ.croq_answer : (subQ.options || []).filter(o => o.is_correct).map(o => o.letter).join(', '));
  const statusHeader = isCorrect
    ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;color:#22c55e;font-weight:800;font-family:var(--font-heading);font-size:0.95rem;">
         <i data-lucide="check-circle" style="width:18px;height:18px;"></i>
         <span>Bonne réponse !</span>
       </div>`
    : `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;color:#ef4444;font-weight:800;font-family:var(--font-heading);font-size:0.95rem;">
         <i data-lucide="x-circle" style="width:18px;height:18px;"></i>
         <span>Réponse incorrecte (Bonne(s) réponse(s) : <strong>${escapeHtml(correctStr)}</strong>)</span>
       </div>`;

  const hasOfficial = subQ.explanation && subQ.explanation.trim().length > 0;
  let expContent = '';
  if (hasOfficial) {
    expContent = `<div style="margin-bottom:10px;">${formatMedicalContent(subQ.explanation.trim())}</div>`;
  } else {
    expContent = `
      <div style="margin-bottom:10px;padding:10px 12px;background:rgba(255,255,255,0.03);border-radius:8px;border-left:3px solid var(--amber);">
        <div style="font-size:0.83rem;color:var(--text-muted);display:flex;align-items:center;gap:6px;">
          <i data-lucide="alert-circle" style="width:15px;height:15px;color:var(--amber);flex-shrink:0;"></i>
          <span><strong>Explication officielle manquante :</strong> Aucune justification n'est fournie dans la base pour cette question.</span>
        </div>
      </div>
    `;
  }

  let croqExtraHtml = '';
  if (subQ.is_croq) {
    const evalData = appState.clinicalRunState?.cardEvaluations ? appState.clinicalRunState.cardEvaluations[subQ.uid] : null;
    if (evalData) {
      if (evalData.feedback) {
        croqExtraHtml += `<div style="margin: 8px 0; padding: 10px; background: rgba(255,255,255,0.04); border-radius: 8px; font-size: 0.88rem; border-left: 3px solid var(--purple);"><strong>Feedback IA :</strong> ${escapeHtml(evalData.feedback)}</div>`;
      }
      if (subQ.croq_answer) {
        croqExtraHtml += `<div style="margin: 8px 0; font-size: 0.88rem; color: var(--text-muted);"><strong>Réponse attendue :</strong> ${escapeHtml(subQ.croq_answer)}</div>`;
      }
    }
  }

  const savedAi = getSavedAiExplanation(subQ.uid, subQ);
  let aiBtnHtml = '';
  if (!savedAi || !savedAi.note) {
    aiBtnHtml = `
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="font-size:0.8rem;color:var(--text-muted);display:flex;align-items:center;gap:6px;">
          <i data-lucide="sparkles" style="width:14px;height:14px;color:var(--cyan);"></i>
          <span>${hasOfficial ? "Besoin d'un raisonnement plus poussé ?" : 'Explication détaillée manquante :'}</span>
        </div>
        <button type="button" class="btn-ask-arena-ai" id="btn-gen-clinical-subq-ai" onclick="window.requestClinicalSubQuestionAiExplanation()" style="padding:8px 16px;font-size:0.82rem;gap:6px;background:linear-gradient(135deg,rgba(0,212,255,0.18),rgba(147,51,234,0.22));border:1px solid var(--cyan);border-radius:8px;color:#ffffff;cursor:pointer;display:inline-flex;align-items:center;font-weight:700;">
          <i data-lucide="sparkles" style="width:13px;height:13px;color:var(--cyan);"></i>
          <span>${hasOfficial ? "Approfondir avec l'explication IA (Gemini Flash)" : "Générer l'explication IA (Gemini Flash)"}</span>
        </button>
      </div>
    `;
  } else {
    aiBtnHtml = `
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;font-size:0.8rem;color:var(--cyan);">
        <span style="display:flex;align-items:center;gap:6px;">
          <i data-lucide="check-check" style="width:14px;height:14px;"></i> Explication IA complète disponible ci-dessous
        </span>
        <button type="button" onclick="window.requestClinicalSubQuestionAiExplanation(true)" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.75rem;display:flex;align-items:center;gap:4px;">
          <i data-lucide="rotate-cw" style="width:12px;height:12px;"></i> Régénérer
        </button>
      </div>
    `;
  }

  expText.innerHTML = statusHeader + expContent + croqExtraHtml + aiBtnHtml;
  expBox.style.display = 'flex';

  renderArenaAiExplanation(subQ);
  refreshLucide(expBox);
}

window.requestClinicalSubQuestionAiExplanation = async function(forceRegen = false) {
  const runState = appState.clinicalRunState;
  if (!runState) return;
  const subQ = runState.subQuestions[runState.currentIndex];
  if (!subQ) return;
  const targetUid = subQ.uid;

  if (forceRegen) {
    delete appState.aiExplanationsCache[targetUid];
    try {
      localStorage.setItem(getAiCacheKey(), JSON.stringify(appState.aiExplanationsCache));
    } catch {}
    queueEngine.deleteReasoningNotesByQuestionUid(targetUid);
  }

  const aiBox = document.getElementById('arena-ai-explanation-box');
  const aiTextEl = document.getElementById('arena-ai-explanation-text');
  const modelTag = document.getElementById('arena-ai-model-tag');
  const regenBtn = document.getElementById('btn-arena-ai-regenerate');

  if (aiBox && aiTextEl) {
    aiBox.style.display = 'flex';
    if (regenBtn) regenBtn.style.display = 'none';
    aiTextEl.innerHTML = `
      <div class="reasoning-loader-wrap" style="padding:16px;text-align:center;">
        <i data-lucide="sparkles" class="spin" style="width:20px;height:20px;color:var(--cyan);margin-bottom:8px;"></i>
        <div style="font-size:0.88rem;color:var(--cyan);font-weight:600;">Génération de l'explication clinique IA complète (Gemini Flash)...</div>
        <div style="font-size:0.75rem;color:var(--text-dim);margin-top:4px;">Analyse du cas clinique complet, justification proposition par proposition et mémo concours.</div>
      </div>
    `;
    refreshLucide(aiBox);
    aiBox.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }

  const btnGen = document.getElementById('btn-gen-clinical-subq-ai');
  if (btnGen) {
    btnGen.disabled = true;
    btnGen.innerHTML = `<i data-lucide="loader" class="spin" style="width:14px;height:14px;"></i> <span>Génération IA en cours...</span>`;
    refreshLucide(btnGen);
  }

  try {
    const clinicalContext = buildClinicalCaseContext(subQ);
    const ans = runState.userAnswers[subQ.uid];
    const isCroq = !!subQ.is_croq;
    const selectedLetters = isCroq ? [] : (ans?.selectedLetters || []);
    const studentCroq = isCroq ? (ans?.croqText || '') : '';

    const reasoningObj = await geminiService.generateReasoningNote(
      subQ,
      selectedLetters,
      isCroq,
      studentCroq,
      clinicalContext
    );

    saveAiExplanationForQuestion(targetUid, reasoningObj.note, reasoningObj.modelUsed, subQ);
    if (runState.cardEvaluations && runState.cardEvaluations[targetUid]) {
      runState.cardEvaluations[targetUid].aiReasoning = reasoningObj.note;
    }

    const currentSubQ = runState.subQuestions[runState.currentIndex];
    if (currentSubQ && currentSubQ.uid === targetUid) {
      if (aiTextEl) aiTextEl.innerHTML = formatReasoningNote(reasoningObj.note);
      if (modelTag) modelTag.textContent = reasoningObj.modelUsed;
      if (regenBtn) {
        regenBtn.style.display = 'inline-flex';
        regenBtn.onclick = () => window.requestClinicalSubQuestionAiExplanation(true);
      }
      refreshLucide(aiBox);

      const evalData = runState.cardEvaluations[targetUid];
      renderClinicalExplanationArea(subQ, evalData ? evalData.isCorrect : true);
    }
  } catch (err) {
    console.error('Error generating clinical sub-question AI explanation:', err);
    if (aiTextEl) {
      aiTextEl.innerHTML = `
        <div style="color:var(--rose);padding:12px;font-size:0.85rem;">
          ⚠️ Erreur de génération : ${escapeHtml(err.message || 'Problème de connexion')}
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn-ask-arena-ai" onclick="window.requestClinicalSubQuestionAiExplanation(true)">Réessayer</button>
          </div>
        </div>
      `;
      refreshLucide(aiBox);
    }
    if (btnGen) {
      btnGen.disabled = false;
      btnGen.innerHTML = `<i data-lucide="sparkles" style="width:13px;height:13px;"></i> <span>Réessayer la génération IA</span>`;
      refreshLucide(btnGen);
    }
  }
};

window.requestClinicalCardAiExplanation = async function(idx, forceRegen = false) {
  if (!appState.isClinicalRunActive || !appState.clinicalRunState) return;
  const runState = appState.clinicalRunState;
  const subQ = runState.subQuestions[idx];
  if (!subQ) return;
  const targetUid = subQ.uid;

  if (forceRegen) {
    delete appState.aiExplanationsCache[targetUid];
    try {
      localStorage.setItem(getAiCacheKey(), JSON.stringify(appState.aiExplanationsCache));
    } catch {}
    queueEngine.deleteReasoningNotesByQuestionUid(targetUid);
  }

  const btn = document.getElementById(`btn-card-ai-exp-${idx}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader" class="spin" style="width:12px;height:12px;"></i> <span>Génération IA en cours...</span>`;
    refreshLucide(btn);
  }

  try {
    const clinicalContext = buildClinicalCaseContext(subQ);
    const ans = runState.userAnswers[subQ.uid];
    const isCroq = !!subQ.is_croq;
    const selectedLetters = isCroq ? [] : (ans?.selectedLetters || []);
    const studentCroq = isCroq ? (ans?.croqText || '') : '';

    const reasoningObj = await geminiService.generateReasoningNote(
      subQ,
      selectedLetters,
      isCroq,
      studentCroq,
      clinicalContext
    );

    saveAiExplanationForQuestion(targetUid, reasoningObj.note, reasoningObj.modelUsed, subQ);
    if (runState.cardEvaluations && runState.cardEvaluations[targetUid]) {
      runState.cardEvaluations[targetUid].aiReasoning = reasoningObj.note;
    }

    renderClinicalScrollView();
  } catch (err) {
    console.error('Error generating card AI explanation:', err);
    showAppToast(`⚠️ Erreur lors de la génération de l'explication IA : ${err.message || 'Problème de connexion'}`, { type: 'error' });
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="sparkles" style="width:12px;height:12px;"></i> <span>Réessayer la génération IA</span>`;
      refreshLucide(btn);
    }
  }
};

export function verifySequentialSubQuestion(subQ) {
  const runState = appState.clinicalRunState;
  if (!subQ || !runState) return;
  saveSequentialCurrentQuestionState();

  const ans = runState.userAnswers[subQ.uid] || { selectedLetters: [], isCroq: false, croqText: '' };
  const userLetters = (ans.selectedLetters || []).slice().sort();

  const correctOptions = (subQ.options || []).filter(o => o.is_correct);
  const correctLetters = correctOptions.map(o => o.letter).sort();

  const isCorrect = userLetters.length > 0 &&
    correctLetters.length === userLetters.length &&
    correctLetters.every((l, idx) => l === userLetters[idx]);

  runState.cardEvaluations[subQ.uid] = {
    isEvaluated: true,
    isCorrect,
    score: isCorrect ? 100 : 0,
    feedback: isCorrect ? 'Excellente réponse !' : 'Réponse inexacte.',
    userText: userLetters.join(', ') || 'Aucune',
    correctText: correctLetters.join(', ')
  };

  document.querySelectorAll('.option-item').forEach(el => {
    const letter = el.dataset.letter;
    const isSelected = userLetters.includes(letter);
    const isCor = correctLetters.includes(letter);

    el.classList.remove('selected');
    if (isSelected && !isCor) {
      el.classList.add('wrong-highlight');
    } else if (isCor) {
      el.classList.add('correct-highlight');
    }
  });

  const optionsContainer = document.getElementById('arena-options-container');
  if (optionsContainer) optionsContainer.style.pointerEvents = 'none';

  renderClinicalExplanationArea(subQ, isCorrect, correctLetters.join(', '));

  const total = runState.subQuestions.length;
  const curNum = runState.currentIndex + 1;
  updateSequentialActionButtons(curNum, total);
  refreshLucide();
}

export async function verifySequentialCroqSubQuestion(subQ) {
  const runState = appState.clinicalRunState;
  if (!subQ || !runState) return;
  saveSequentialCurrentQuestionState();

  const ans = runState.userAnswers[subQ.uid];
  const userInput = ans ? ans.croqText : '';
  if (!userInput) {
    showAppToast('Veuillez saisir votre réponse avant de vérifier.', { type: 'warning' });
    return;
  }

  const btnSubmitCroq = document.getElementById('btn-submit-croq');
  if (btnSubmitCroq) {
    btnSubmitCroq.disabled = true;
    btnSubmitCroq.innerHTML = `<i data-lucide="loader" class="spin"></i> <span>Évaluation IA en cours...</span>`;
    refreshLucide(btnSubmitCroq);
  }

  let isCorrect = false;
  let score = null;
  let feedback = '';

  try {
    const evalResult = await geminiService.evaluateCroq(
      subQ.question || subQ.statement,
      runState.caseStatement,
      subQ.croq_answer,
      userInput,
      subQ
    );
    score = evalResult.score;
    feedback = evalResult.feedback;
    isCorrect = evalResult.isValid && score >= 75;
  } catch (err) {
    console.error('Error evaluating sequential CROQ:', err);
    isCorrect = false;
    feedback = err.message && err.message.includes('API Gemini')
      ? err.message
      : 'Évaluation hors-ligne : réponse enregistrée.';
  }

  runState.cardEvaluations[subQ.uid] = {
    isEvaluated: true,
    isCorrect,
    score,
    feedback,
    userText: userInput,
    correctText: subQ.croq_answer
  };

  const croqInput = document.getElementById('arena-croq-input');
  if (croqInput) croqInput.disabled = true;

  renderClinicalExplanationArea(subQ, isCorrect);

  const total = runState.subQuestions.length;
  const curNum = runState.currentIndex + 1;
  updateSequentialActionButtons(curNum, total);
  refreshLucide();
}

export function renderClinicalSequentialView() {
  const runState = appState.clinicalRunState;
  if (!appState.isClinicalRunActive || !runState) return;

  const scrollContainer = document.getElementById('arena-clinical-scroll-container');
  if (scrollContainer) scrollContainer.style.display = 'none';

  const optionsContainer = document.getElementById('arena-options-container');
  const croqContainer = document.getElementById('arena-croq-container');
  const defaultActions = document.getElementById('arena-default-actions');
  const successBanner = document.getElementById('arena-success-banner');
  const expBox = document.getElementById('arena-explanation-box');
  const aiBox = document.getElementById('arena-ai-explanation-box');
  const questionText = document.getElementById('arena-question-text');
  const mediaWrap = document.getElementById('arena-media-wrap');
  const subBadge = document.getElementById('arena-subquestion-badge');
  const subBadgeText = document.getElementById('arena-subquestion-badge-text');

  if (questionText) questionText.style.display = 'block';
  if (successBanner) successBanner.style.display = 'none';
  if (expBox) expBox.style.display = 'none';
  if (aiBox) aiBox.style.display = 'none';
  if (defaultActions) defaultActions.style.display = 'flex';

  const subQ = runState.subQuestions[runState.currentIndex];
  if (!subQ) return;

  appState.currentQuestion = subQ;

  const total = runState.subQuestions.length;
  const curNum = runState.currentIndex + 1;
  if (subBadge && subBadgeText) {
    subBadgeText.textContent = `Cas Clinique ${runState.casePrefix} • Question ${curNum}/${total}`;
    subBadge.style.display = 'inline-flex';
  }

  if (questionText) questionText.innerHTML = formatMedicalContent(subQ.question || subQ.statement);

  if (mediaWrap) {
    if (subQ.media_urls && subQ.media_urls.length > 0) {
      mediaWrap.innerHTML = renderQuestionMedia(subQ.media_urls);
      mediaWrap.style.display = 'block';
    } else {
      mediaWrap.innerHTML = '';
      mediaWrap.style.display = 'none';
    }
  }

  const savedAns = runState.userAnswers[subQ.uid];
  const evalData = runState.cardEvaluations ? runState.cardEvaluations[subQ.uid] : null;
  const isAlreadyEvaluated = !!evalData;

  appState.selectedOptionIds.clear();

  const btnSubmitAnswer = document.getElementById('btn-submit-answer');
  const btnSubmitCroq = document.getElementById('btn-submit-croq');
  const shortcutHint = document.getElementById('keyboard-shortcuts-hint');

  if (subQ.is_croq) {
    if (optionsContainer) optionsContainer.style.display = 'none';
    if (croqContainer) croqContainer.style.display = 'flex';
    const croqInput = document.getElementById('arena-croq-input');
    if (croqInput) {
      croqInput.value = isAlreadyEvaluated ? (evalData.userText || '') : (savedAns ? savedAns.croqText : '');
      croqInput.disabled = isAlreadyEvaluated;
      croqInput.oninput = () => {
        const hasText = croqInput.value.trim().length > 0;
        const btnSave = document.getElementById('btn-clinical-save-next');
        if (btnSave && !isAlreadyEvaluated) btnSave.disabled = !hasText;
        if (btnSubmitCroq && !isAlreadyEvaluated) btnSubmitCroq.disabled = !hasText;
      };
    }
    if (btnSubmitAnswer) btnSubmitAnswer.style.display = 'none';
    if (btnSubmitCroq) btnSubmitCroq.style.display = 'flex';
    if (shortcutHint) shortcutHint.textContent = `Mode Cas Clinique Séquentiel • CROQ (${curNum}/${total})`;

    if (isAlreadyEvaluated) {
      renderClinicalExplanationArea(subQ, evalData.isCorrect);
    }
  } else {
    if (croqContainer) croqContainer.style.display = 'none';
    if (optionsContainer) {
      optionsContainer.style.display = 'flex';
      optionsContainer.style.pointerEvents = isAlreadyEvaluated ? 'none' : 'auto';
    }
    if (btnSubmitAnswer) btnSubmitAnswer.style.display = 'flex';
    if (btnSubmitCroq) btnSubmitCroq.style.display = 'none';
    if (shortcutHint) shortcutHint.textContent = `Mode Cas Clinique Séquentiel • Question ${curNum}/${total}`;

    renderOptionsList(subQ.options || []);

    if (isAlreadyEvaluated) {
      const correctOptions = (subQ.options || []).filter(o => o.is_correct);
      const correctLetters = correctOptions.map(o => o.letter).sort();
      const userLetters = (savedAns?.selectedLetters || []).slice();

      document.querySelectorAll('.option-item').forEach(el => {
        const letter = el.dataset.letter;
        const isSelected = userLetters.includes(letter);
        const isCor = correctLetters.includes(letter);
        el.classList.remove('selected');
        if (isSelected && !isCor) {
          el.classList.add('wrong-highlight');
        } else if (isCor) {
          el.classList.add('correct-highlight');
        }
      });

      renderClinicalExplanationArea(subQ, evalData.isCorrect, correctLetters.join(', '));
    } else if (savedAns && savedAns.selectedLetters && savedAns.selectedLetters.length > 0) {
      document.querySelectorAll('.option-item').forEach(el => {
        if (savedAns.selectedLetters.includes(el.dataset.letter)) {
          appState.selectedOptionIds.add(el.dataset.optId);
          el.classList.add('selected');
        }
      });
    }
  }

  updateSequentialActionButtons(curNum, total);
  updateClinicalRunBarUI();
  refreshLucide();
}

export function renderClinicalScrollView() {
  const runState = appState.clinicalRunState;
  if (!appState.isClinicalRunActive || !runState) return;

  const hideIds = [
    'arena-question-text',
    'arena-media-wrap',
    'arena-options-container',
    'arena-croq-container',
    'arena-default-actions',
    'arena-success-banner',
    'arena-explanation-box',
    'arena-ai-explanation-box',
    'arena-subquestion-badge',
    'arena-clinical-sequential-stepper'
  ];
  hideIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const scrollContainer = document.getElementById('arena-clinical-scroll-container');
  if (!scrollContainer) return;
  scrollContainer.style.display = 'flex';

  const total = runState.subQuestions.length;
  let cardsHtml = '';

  runState.subQuestions.forEach((sq, idx) => {
    const qNum = idx + 1;
    const savedAns = runState.userAnswers[sq.uid] || { selectedLetters: [], isCroq: !!sq.is_croq, croqText: '' };
    const evalData = runState.cardEvaluations[sq.uid] || null;

    let statusBadgeClass = 'unanswered';
    let statusBadgeText = 'Non répondue';

    if (evalData) {
      if (evalData.isCorrect) {
        statusBadgeClass = 'correct';
        statusBadgeText = '✅ Validée Juste';
      } else {
        statusBadgeClass = 'wrong';
        statusBadgeText = '❌ Validée Fausse';
      }
    } else if (savedAns && ((savedAns.selectedLetters && savedAns.selectedLetters.length > 0) || savedAns.croqText)) {
      statusBadgeClass = 'answered';
      statusBadgeText = '✏️ Répondue';
    }

    let cardExtraClass = '';
    if (evalData) {
      cardExtraClass = evalData.isCorrect ? 'is-validated-correct' : 'is-validated-wrong';
    }

    let mediaHtml = '';
    if (sq.media_urls && sq.media_urls.length > 0) {
      mediaHtml = `<div style="margin-bottom:12px;">${renderQuestionMedia(sq.media_urls)}</div>`;
    }

    let bodyHtml = '';
    if (sq.is_croq) {
      bodyHtml = `
        <div class="croq-container" style="display:flex;">
          <textarea class="croq-textarea" id="clinical-scroll-croq-${idx}" placeholder="Saisissez votre réponse pour cette question..." oninput="window.onClinicalScrollCroqInput(${idx}, this.value)">${escapeHtml(savedAns.croqText || '')}</textarea>
        </div>
      `;
    } else {
      const opts = sq.options || [];
      bodyHtml = `
        <div class="clinical-card-options">
          ${opts.map((opt, oIdx) => {
            const letter = opt.letter || String.fromCharCode(65 + oIdx);
            const isSelected = savedAns.selectedLetters && savedAns.selectedLetters.includes(letter);
            let optClass = 'clinical-card-opt-item';
            if (isSelected) optClass += ' selected';
            if (evalData) {
              if (opt.is_correct) optClass += ' correct-revealed';
              else if (isSelected && !opt.is_correct) optClass += ' wrong-revealed';
            }

            return `
              <div class="${optClass}" onclick="window.toggleClinicalScrollOption(${idx}, '${escapeHtml(letter)}')">
                <span class="clinical-card-opt-letter">${escapeHtml(letter)}</span>
                <span class="clinical-card-opt-text">${parseMarkdownInline(opt.text || '')}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    let feedbackHtml = '';
    if (evalData) {
      const fbClass = evalData.isCorrect ? 'correct' : 'wrong';
      const fbIcon = evalData.isCorrect ? 'check-circle' : 'alert-circle';
      const hasOfficial = sq.explanation && sq.explanation.trim().length > 0;
      let expText = hasOfficial ? formatMedicalContent(sq.explanation.trim()) : '';

      let croqDetailsHtml = '';
      if (sq.is_croq) {
        if (evalData.feedback) {
          croqDetailsHtml += `<div style="margin: 6px 0; padding: 8px 10px; background: rgba(255,255,255,0.04); border-radius: 6px; font-size: 0.84rem; border-left: 3px solid var(--purple);"><strong>Feedback IA :</strong> ${escapeHtml(evalData.feedback)}</div>`;
        }
        if (sq.croq_answer) {
          croqDetailsHtml += `<div style="margin: 6px 0; font-size: 0.84rem; color: var(--text-muted);"><strong>Réponse attendue :</strong> ${escapeHtml(sq.croq_answer)}</div>`;
        }
      } else if (!hasOfficial) {
        expText = `<span style="color:var(--amber);">⚠️ <em>Explication officielle non disponible dans la base.</em></span>`;
      }

      const savedAi = getSavedAiExplanation(sq.uid, sq);
      let aiNoteHtml = '';
      if (savedAi && savedAi.note) {
        aiNoteHtml = `
          <div class="clinical-card-ai-note">
            <div class="clinical-card-ai-header">
              <span class="clinical-card-ai-title">
                <i data-lucide="sparkles" style="width:13px;height:13px;color:var(--cyan);"></i> Explication IA complète (${escapeHtml(savedAi.modelUsed || 'Gemini Flash')})
              </span>
              <button type="button" class="btn-card-regen-ai" onclick="window.requestClinicalCardAiExplanation(${idx}, true)" title="Régénérer l'explication IA">
                <i data-lucide="rotate-cw" style="width:12px;height:12px;"></i>
              </button>
            </div>
            <div class="clinical-card-ai-body">
              ${formatReasoningNote(savedAi.note)}
            </div>
          </div>
        `;
      } else {
        aiNoteHtml = `
          <div style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.1);display:flex;justify-content:flex-end;">
            <button type="button" class="btn-card-gen-ai-exp" id="btn-card-ai-exp-${idx}" onclick="window.requestClinicalCardAiExplanation(${idx})">
              <i data-lucide="sparkles" style="width:12px;height:12px;"></i>
              <span>${hasOfficial ? "Approfondir avec l'explication IA (Flash)" : "Générer l'explication IA (Flash)"}</span>
            </button>
          </div>
        `;
      }

      feedbackHtml = `
        <div class="clinical-card-feedback ${fbClass}">
          <div style="display:flex;align-items:center;gap:6px;font-weight:700;margin-bottom:4px;">
            <i data-lucide="${fbIcon}" style="width:14px;height:14px;"></i>
            <span>${evalData.isCorrect ? 'Bonne réponse !' : 'Réponse incorrecte !'}</span>
          </div>
          ${expText ? `<div style="font-size:0.88rem;line-height:1.45;margin-bottom:4px;">${expText}</div>` : ''}
          ${croqDetailsHtml}
          ${aiNoteHtml}
        </div>
      `;
    }

    cardsHtml += `
      <div class="clinical-card ${cardExtraClass}" id="clinical-card-${idx}">
        <div class="clinical-card-header">
          <div class="clinical-card-qnum">
            <i data-lucide="help-circle" style="width:14px;height:14px;"></i>
            <span>Question ${qNum} / ${total}</span>
          </div>
          <span class="clinical-card-status-badge ${statusBadgeClass}" id="clinical-card-badge-${idx}">
            ${statusBadgeText}
          </span>
        </div>
        <div class="clinical-card-statement">
          ${formatMedicalContent(sq.question || sq.statement)}
        </div>
        ${mediaHtml}
        ${bodyHtml}
        <div class="clinical-card-actions">
          <button type="button" class="btn-clinical-card-validate" onclick="window.validateClinicalCardSubQuestion(${idx})">
            <i data-lucide="check" style="width:13px;height:13px;"></i>
            <span>Vérifier cette question</span>
          </button>
        </div>
        ${feedbackHtml}
      </div>
    `;
  });

  const answeredCount = Object.keys(runState.userAnswers).length;
  cardsHtml += `
    <div class="clinical-scroll-master-actions">
      <div class="clinical-scroll-master-info">
        <i data-lucide="target" style="width:16px;height:16px;color:var(--cyan);"></i>
        <span><strong>${answeredCount}/${total}</strong> question(s) renseignée(s)</span>
      </div>
      <button type="button" class="btn-master-validate-case" id="btn-master-validate-case" onclick="window.validateAllClinicalSubQuestions()">
        <i data-lucide="check-check" style="width:18px;height:18px;"></i>
        <span>Valider tout le cas clinique & Voir le Bilan</span>
      </button>
    </div>
  `;

  scrollContainer.innerHTML = cardsHtml;
  updateClinicalRunBarUI();
  refreshLucide(scrollContainer);
}

window.toggleClinicalScrollOption = function(qIdx, letter) {
  const runState = appState.clinicalRunState;
  if (!appState.isClinicalRunActive || !runState) return;
  const subQ = runState.subQuestions[qIdx];
  if (!subQ) return;

  if (!runState.userAnswers[subQ.uid]) {
    runState.userAnswers[subQ.uid] = { selectedLetters: [], isCroq: false, croqText: '' };
  }

  const ans = runState.userAnswers[subQ.uid];
  const lIdx = ans.selectedLetters.indexOf(letter);
  if (lIdx === -1) {
    ans.selectedLetters.push(letter);
  } else {
    ans.selectedLetters.splice(lIdx, 1);
  }
  ans.selectedLetters.sort();

  delete runState.cardEvaluations[subQ.uid];
  renderClinicalScrollView();
};

window.onClinicalScrollCroqInput = function(qIdx, text) {
  const runState = appState.clinicalRunState;
  if (!appState.isClinicalRunActive || !runState) return;
  const subQ = runState.subQuestions[qIdx];
  if (!subQ) return;

  if (!runState.userAnswers[subQ.uid]) {
    runState.userAnswers[subQ.uid] = { selectedLetters: [], isCroq: true, croqText: '' };
  }
  runState.userAnswers[subQ.uid].croqText = text.trim();
  delete runState.cardEvaluations[subQ.uid];
  updateClinicalRunBarUI();
};

window.validateClinicalCardSubQuestion = async function(qIdx) {
  const runState = appState.clinicalRunState;
  if (!appState.isClinicalRunActive || !runState) return;
  const subQ = runState.subQuestions[qIdx];
  if (!subQ) return;

  const ans = runState.userAnswers[subQ.uid];
  if (!ans || (!ans.isCroq && ans.selectedLetters.length === 0) || (ans.isCroq && !ans.croqText)) {
    showAppToast('Veuillez sélectionner au moins une proposition ou rédiger votre réponse avant de vérifier cette question.', { type: 'warning' });
    return;
  }

  let isCorrect = false;
  let score = null;
  let feedback = '';

  if (subQ.is_croq) {
    try {
      const evalResult = await geminiService.evaluateCroq(
        subQ.question || subQ.statement,
        runState.caseStatement,
        subQ.croq_answer,
        ans.croqText,
        subQ
      );
      score = evalResult.score;
      feedback = evalResult.feedback;
      isCorrect = evalResult.isValid && score >= 75;
    } catch (err) {
      isCorrect = false;
      feedback = err.message && err.message.includes('API Gemini') ? err.message : '';
    }
  } else {
    const correctOptions = (subQ.options || []).filter(o => o.is_correct);
    const correctLetters = correctOptions.map(o => o.letter).sort();
    const userLetters = (ans.selectedLetters || []).slice().sort();

    isCorrect = (correctLetters.length === userLetters.length) &&
      correctLetters.every((l, i) => l === userLetters[i]);
  }

  runState.cardEvaluations[subQ.uid] = {
    isEvaluated: true,
    isCorrect,
    score,
    feedback,
    userText: ans.isCroq ? ans.croqText : ans.selectedLetters.join(', '),
    correctText: subQ.is_croq ? subQ.croq_answer : (subQ.options || []).filter(o => o.is_correct).map(o => o.letter).join(', ')
  };

  renderClinicalScrollView();
};

window.validateAllClinicalSubQuestions = async function() {
  const runState = appState.clinicalRunState;
  if (!appState.isClinicalRunActive || !runState) return;

  if (runState.mode === 'sequential') {
    saveSequentialCurrentQuestionState();
  }

  const subQuestions = runState.subQuestions;
  const total = subQuestions.length;

  const unansweredCount = subQuestions.filter(sq => {
    const ans = runState.userAnswers[sq.uid];
    if (!ans) return true;
    if (sq.is_croq) return !ans.croqText;
    return !ans.selectedLetters || ans.selectedLetters.length === 0;
  }).length;

  if (unansweredCount > 0) {
    const proceed = await showConfirmModal({
      title: 'Valider le cas clinique ?',
      message: `Il reste ${unansweredCount} question(s) sans réponse dans ce cas clinique. Les questions non répondues seront considérées comme fausses.\n\nSouhaitez-vous valider le cas maintenant ?`,
      confirmLabel: 'Valider le cas',
      isDanger: true
    });
    if (!proceed) return;
  }

  const masterBtn = document.getElementById('btn-master-validate-case');
  if (masterBtn) {
    masterBtn.disabled = true;
    masterBtn.innerHTML = `<i data-lucide="loader" class="spin"></i> <span>Évaluation du cas clinique en cours...</span>`;
    refreshLucide(masterBtn);
  }

  const results = [];
  const failedUids = [];
  const allCaseUids = subQuestions.map(sq => sq.uid);

  for (let i = 0; i < total; i++) {
    const sq = subQuestions[i];
    const ans = runState.userAnswers[sq.uid] || { selectedLetters: [], isCroq: !!sq.is_croq, croqText: '' };
    let evalData = runState.cardEvaluations[sq.uid];

    if (!evalData) {
      let isCorrect = false;
      let score = null;
      let feedback = '';

      if (sq.is_croq) {
        if (ans.croqText) {
          try {
            const evalResult = await geminiService.evaluateCroq(
              sq.question || sq.statement,
              runState.caseStatement,
              sq.croq_answer,
              ans.croqText,
              sq
            );
            score = evalResult.score;
            feedback = evalResult.feedback;
            isCorrect = evalResult.isValid && score >= 75;
          } catch {
            isCorrect = false;
          }
        } else {
          isCorrect = false;
        }
      } else {
        const correctOptions = (sq.options || []).filter(o => o.is_correct);
        const correctLetters = correctOptions.map(o => o.letter).sort();
        const userLetters = (ans.selectedLetters || []).slice().sort();

        isCorrect = userLetters.length > 0 &&
          correctLetters.length === userLetters.length &&
          correctLetters.every((l, idx) => l === userLetters[idx]);
      }

      evalData = {
        isEvaluated: true,
        isCorrect,
        score,
        feedback,
        userText: sq.is_croq ? (ans.croqText || 'Aucune réponse') : (ans.selectedLetters.join(', ') || 'Aucune'),
        correctText: sq.is_croq ? sq.croq_answer : (sq.options || []).filter(o => o.is_correct).map(o => o.letter).join(', ')
      };
      runState.cardEvaluations[sq.uid] = evalData;
    }

    results.push({
      question: sq,
      isCorrect: evalData.isCorrect,
      score: evalData.score,
      userAnswer: evalData.userText,
      correctAnswer: evalData.correctText
    });

    if (!evalData.isCorrect) {
      failedUids.push(sq.uid);
    }
  }

  const isAllCorrect = failedUids.length === 0;
  const correctCount = results.filter(r => r.isCorrect).length;

  let activeCreditedCount = 0;
  let alreadyMasteredCount = 0;
  const alreadyCleanedUids = [];

  allCaseUids.forEach(uid => {
    const st = queueEngine.getQuestionStats(uid);
    if (st && st.done) {
      alreadyCleanedUids.push(uid);
    }
  });

  if (isAllCorrect) {
    const successResult = queueEngine.handleClinicalCaseSuccess(allCaseUids);
    activeCreditedCount = successResult.activeCreditedCount || 0;
    alreadyMasteredCount = successResult.alreadyMasteredCount || 0;

    if (activeCreditedCount > 0) {
      queueEngine.incrementTodayCount(activeCreditedCount);
    }

    allCaseUids.forEach(uid => {
      studyTracker.recordAnswer(true, runState.chapterId, uid);
    });

    triggerMasteryConfetti();
  } else {
    queueEngine.handleClinicalCaseFailure(allCaseUids, failedUids);

    failedUids.forEach(uid => {
      studyTracker.recordAnswer(false, runState.chapterId, uid);
    });
  }

  updateArenaDailyBadge();
  if (appState.currentView === 'stats') renderStatsUI();
  appState.firebaseSyncService?.triggerAutoPush();

  showClinicalCaseSummaryModal({
    isAllCorrect,
    totalCount: total,
    correctCount,
    failedUids,
    subQuestions,
    results,
    casePrefix: runState.casePrefix,
    caseStatement: runState.caseStatement,
    chapterTitle: runState.chapterTitle,
    activeCreditedCount,
    alreadyMasteredCount,
    alreadyCleanedUids
  });
};

async function showClinicalCaseSummaryModal(summaryData) {
  const modal = document.getElementById('modal-clinical-case-summary');
  if (!modal) return;

  const verdictBanner = document.getElementById('clinical-verdict-banner');
  const verdictIcon = document.getElementById('clinical-verdict-icon');
  const verdictTitle = document.getElementById('clinical-verdict-title');
  const verdictDesc = document.getElementById('clinical-verdict-desc');
  const srsTitle = document.getElementById('clinical-summary-srs-title');
  const srsDesc = document.getElementById('clinical-summary-srs-desc');
  const scoreBadge = document.getElementById('clinical-summary-score-badge');
  const itemsList = document.getElementById('clinical-summary-items-list');
  const aiBox = document.getElementById('clinical-summary-ai-box');
  const aiNote = document.getElementById('clinical-summary-ai-note');
  const aiModelTag = document.getElementById('clinical-summary-model-tag');

  const {
    isAllCorrect,
    totalCount,
    correctCount,
    results,
    casePrefix,
    caseStatement,
    chapterTitle,
    subQuestions,
    activeCreditedCount = 0,
    alreadyMasteredCount = 0,
    alreadyCleanedUids = []
  } = summaryData;

  if (isAllCorrect) {
    if (verdictBanner) verdictBanner.className = 'clinical-verdict-banner is-success';
    if (verdictIcon) verdictIcon.textContent = '🎉';
    if (verdictTitle) verdictTitle.textContent = `Cas Clinique 100% Validé ! (${totalCount}/${totalCount})`;
    if (verdictDesc) verdictDesc.textContent = `Félicitations ! Toutes les ${totalCount} sous-questions ont été répondues sans aucune faute.`;

    if (alreadyMasteredCount > 0) {
      if (srsTitle) srsTitle.textContent = `Progression : +${activeCreditedCount} question(s) ajoutée(s) au compteur du jour !`;
      if (srsDesc) srsDesc.textContent = `${activeCreditedCount} question(s) active(s) ont avancé dans leur répétition espacée (${alreadyMasteredCount} sous-question(s) étaient déjà définitivement nettoyées et ne sont pas recomptées).`;
    } else {
      if (srsTitle) srsTitle.textContent = `Progression Complète : +${totalCount} succès enregistrés !`;
      if (srsDesc) srsDesc.textContent = `Toutes les questions du cas ont avancé (+1 palier de répétition espacée) et ont été ajoutées à votre quota journalier.`;
    }

    if (scoreBadge) {
      scoreBadge.textContent = `${totalCount}/${totalCount} (100%)`;
      scoreBadge.style.background = 'rgba(16,185,129,0.2)';
      scoreBadge.style.color = 'var(--emerald)';
    }

    if (aiBox) aiBox.style.display = 'none';
  } else {
    if (verdictBanner) verdictBanner.className = 'clinical-verdict-banner is-failure';
    if (verdictIcon) verdictIcon.textContent = '⚠️';
    if (verdictTitle) verdictTitle.textContent = `Cas Clinique Échoué (${correctCount}/${totalCount} justes — 0 créditée)`;
    if (verdictDesc) verdictDesc.textContent = "Règle stricte du Cas Clinique : une seule erreur invalide l'ensemble du cas. Aucune question n'est créditée.";

    if (srsTitle) srsTitle.textContent = 'Pénalité SRS : Réapparition groupée dans 5 à 7 cartes';
    if (srsDesc) srsDesc.textContent = "Les questions ratées ont été pénalisées. L'intégralité du cas clinique réapparaîtra groupée pour ancrer le raisonnement.";

    if (scoreBadge) {
      scoreBadge.textContent = `${correctCount}/${totalCount} (${totalCount - correctCount} faute(s))`;
      scoreBadge.style.background = 'rgba(239,68,68,0.2)';
      scoreBadge.style.color = 'var(--rose)';
    }

    if (aiBox && aiNote) {
      aiBox.style.display = 'block';
      aiNote.innerHTML = `
        <div class="reasoning-loader-wrap">
          <i data-lucide="sparkles" class="spin"></i>
          <span>Génération de la note de synthèse clinique consolidée par l'IA Flash...</span>
        </div>
      `;
      refreshLucide(aiBox);

      geminiService.generateClinicalCaseSynthesisNote(
        caseStatement,
        subQuestions,
        results,
        chapterTitle
      ).then(synthesisObj => {
        aiNote.innerHTML = formatReasoningNote(synthesisObj.note);
        if (aiModelTag) aiModelTag.textContent = synthesisObj.modelUsed;

        const targetQ = subQuestions[0] || {};
        saveAiExplanationForQuestion(
          targetQ.uid || `case_${casePrefix}`,
          synthesisObj.note,
          synthesisObj.modelUsed,
          targetQ
        );
        refreshLucide(aiBox);
      }).catch(err => {
        console.warn('AI synthesis failed:', err);
        aiNote.innerHTML = `<div style="color:var(--rose);font-size:0.84rem;">⚠️ ${escapeHtml(err.message || 'Synthèse IA indisponible')}</div>`;
      });
    }
  }

  let itemsHtml = '';
  results.forEach((r, idx) => {
    const isCor = r.isCorrect;
    const statusIcon = isCor ? 'check-circle' : 'x-circle';
    const statusColor = isCor ? 'var(--emerald)' : 'var(--rose)';
    const itemClass = isCor ? 'clinical-summary-item is-correct' : 'clinical-summary-item is-wrong';
    const wasAlreadyCleaned = isAllCorrect && alreadyCleanedUids.includes(r.question.uid);

    let tagHtml = '';
    if (isCor) {
      if (wasAlreadyCleaned) {
        tagHtml = `<span style="font-size:0.7rem;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.08);color:var(--text-muted);margin-right:6px;">Déjà nettoyée</span>`;
      } else {
        tagHtml = `<span style="font-size:0.7rem;padding:2px 6px;border-radius:4px;background:rgba(16,185,129,0.18);color:var(--emerald);margin-right:6px;">+1 au jour</span>`;
      }
    }

    itemsHtml += `
      <div class="${itemClass}">
        <div class="clinical-summary-item-left">
          <i data-lucide="${statusIcon}" style="width:16px;height:16px;color:${statusColor};flex-shrink:0;"></i>
          <span class="clinical-summary-item-title">
            <strong>Q${idx + 1} :</strong> ${escapeHtml(r.question.question || r.question.statement || '')}
          </span>
        </div>
        <div style="font-size:0.75rem;font-weight:700;color:${statusColor};white-space:nowrap;display:flex;align-items:center;">
          ${tagHtml}
          <span>${isCor ? 'Juste' : 'Faux'}</span>
        </div>
      </div>
    `;
  });

  if (itemsList) itemsList.innerHTML = itemsHtml;
  modal.style.display = 'flex';
  refreshLucide(modal);
}

function teardownClinicalRunView() {
  appState.isClinicalRunActive = false;
  appState.clinicalRunState = null;
  appState.isEvaluating = false;
  updateClinicalRunBarUI();

  const stepperBar = document.getElementById('arena-clinical-sequential-stepper');
  if (stepperBar) stepperBar.style.display = 'none';

  const btnClinicalSaveNext = document.getElementById('btn-clinical-save-next');
  if (btnClinicalSaveNext) btnClinicalSaveNext.style.display = 'none';

  const optionsContainer = document.getElementById('arena-options-container');
  if (optionsContainer) optionsContainer.style.pointerEvents = 'auto';

  const scrollContainer = document.getElementById('arena-clinical-scroll-container');
  if (scrollContainer) {
    scrollContainer.style.display = 'none';
    scrollContainer.innerHTML = '';
  }

  const questionText = document.getElementById('arena-question-text');
  if (questionText) questionText.style.display = 'block';

  loadNextArenaQuestion();
}

window.closeClinicalCaseSummaryModal = function() {
  const modal = document.getElementById('modal-clinical-case-summary');
  if (modal) modal.style.display = 'none';
  teardownClinicalRunView();
};

window.quitClinicalCaseRun = async function() {
  if (!appState.isClinicalRunActive) return;
  const ok = await showConfirmModal({
    title: 'Quitter le cas clinique ?',
    message: 'Voulez-vous quitter la résolution du cas complet ? Vos réponses pour ce cas ne seront pas enregistrées.',
    confirmLabel: 'Quitter le cas',
    isDanger: true
  });
  if (!ok) return;
  teardownClinicalRunView();
};
