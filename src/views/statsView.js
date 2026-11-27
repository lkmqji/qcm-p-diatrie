// ============================================================================
// Statistiques & Analytique Étude QCM (KPIs, Heatmap, Vélocité, Cours)
// ============================================================================
import { appState, queueEngine } from '../state/appState.js';
import { studyTracker } from '../services/studyTracker.js';
import { getActiveModule } from '../services/moduleCatalog.js';
import {
  formatNumber,
  escapeHtml,
  getDateStrWithOffset,
  getDayLabelForOffset,
  formatDuration,
  formatDateFr
} from '../utils/formatters.js';
import { refreshLucide, showAppToast } from '../utils/uiDialogs.js';
import { getExamCountdownMetrics } from './dashboardView.js';
import {
  renderLessonTrackerUI,
  switchStatsSubpage,
  getCurrentStatsSubpage
} from './lessonView.js';

let currentStatsRange = 'today'; // 'today' | '7' | '14' | '21' | '28' | '30' | 'all' | 'custom'
let customStatsStart = '';
let customStatsEnd = '';
let selectedDayOffset = 0;
let courseTrackerMode = 'period'; // 'period' | 'global'
let courseTrackerSearchQuery = '';
let lastRenderedChapterTotals = {};
let lastRenderedPeriodLabel = '';

export function setupStatsEventListeners() {
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
            selectedDayOffset = 0;
          }
          currentStatsRange = 'today';
        } else {
          selectedDayOffset = 0;
          currentStatsRange = r;
        }

        if (r === 'custom') {
          if (customPicker) {
            customPicker.style.display = 'flex';
            const today = studyTracker.getTodayDateStr();
            if (customEndInput && !customEndInput.value) customEndInput.value = today;
            if (customStartInput && !customStartInput.value) {
              customStartInput.value = getDateStrWithOffset(-7);
            }
            customStatsStart = customStartInput?.value || today;
            customStatsEnd = customEndInput?.value || today;
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

  ['box-custom-date-start', 'box-custom-date-end'].forEach(boxId => {
    const box = document.getElementById(boxId);
    if (box) {
      box.addEventListener('click', (e) => {
        const inp = box.querySelector('input[type="date"]');
        if (inp && e.target !== inp) {
          if (typeof inp.showPicker === 'function') {
            try { inp.showPicker(); } catch (_) { inp.focus(); }
          } else {
            inp.focus();
          }
        }
      });
    }
  });

  if (btnApplyCustom) {
    btnApplyCustom.onclick = () => {
      customStatsStart = customStartInput?.value || '';
      customStatsEnd = customEndInput?.value || '';
      if (!customStatsStart || !customStatsEnd) {
        showAppToast('Veuillez sélectionner une date de début et une date de fin.', { type: 'warning' });
        return;
      }
      renderStatsUI();
      refreshLucide();
    };
  }

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
}

export function renderStatsUI() {
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
  } else if (['7', '14', '21', '28', '30'].includes(currentStatsRange)) {
    rangeDays = studyTracker.getDaysByRange(currentStatsRange);
    rangeLabel = `${currentStatsRange} jours`;
  } else {
    const targetDateStr = getDateStrWithOffset(selectedDayOffset);
    const targetRecord = studyTracker.getOrCreateDayRecord(targetDateStr);
    rangeDays = [targetRecord];
    rangeLabel = getDayLabelForOffset(selectedDayOffset);
  }

  const dayTextEl = document.getElementById('range-day-text');
  if (dayTextEl) {
    dayTextEl.textContent = (currentStatsRange === 'today') ? rangeLabel : "Aujourd'hui";
  }
  const nextDayBtn = document.getElementById('btn-stats-next-day');
  if (nextDayBtn) {
    nextDayBtn.disabled = (selectedDayOffset >= 0);
  }

  const rangeToggleEl = document.getElementById('stats-range-toggle');
  if (rangeToggleEl) {
    rangeToggleEl.querySelectorAll('.range-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.range === currentStatsRange);
    });
  }

  const periodAnalytics = (currentStatsRange === 'all')
    ? studyTracker.getGlobalAnalytics()
    : studyTracker.getAnalyticsForDays(rangeDays);

  const streakMetrics = studyTracker.getStreakMetrics();

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

  const qLabelEl = document.getElementById('kpi-questions-label');
  const qTotalEl = document.getElementById('kpi-total-questions');
  const qSubEl = document.getElementById('kpi-questions-sub');
  if (qLabelEl) {
    if (currentStatsRange === 'today') qLabelEl.textContent = "Questions (Aujourd'hui)";
    else if (currentStatsRange === 'all') qLabelEl.textContent = 'Total Questions Faites';
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

  const accLabelEl = document.getElementById('kpi-accuracy-label');
  const accEl = document.getElementById('kpi-accuracy-pct');
  const accSubEl = document.getElementById('kpi-accuracy-sub');
  if (accLabelEl) {
    if (currentStatsRange === 'today') accLabelEl.textContent = "Précision (Aujourd'hui)";
    else if (currentStatsRange === 'all') accLabelEl.textContent = 'Précision Globale';
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

  const speedLabelEl = document.getElementById('kpi-speed-label');
  const speedEl = document.getElementById('kpi-avg-speed');
  const speedSubEl = document.getElementById('kpi-speed-sub');
  if (speedLabelEl) {
    if (currentStatsRange === 'today') speedLabelEl.textContent = "Vitesse (Aujourd'hui)";
    else if (currentStatsRange === 'all') speedLabelEl.textContent = 'Vitesse Moyenne Globale';
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
      speedSubEl.textContent = 'Justes : --s • Fautes : --s';
    }
  }

  const finishLabelEl = document.getElementById('kpi-finish-label');
  const finishValEl = document.getElementById('kpi-finish-value');
  const finishSubEl = document.getElementById('kpi-finish-sub');

  if (finishValEl) {
    const dashboardMetrics = queueEngine.getDashboardMetrics();
    const totalIterationsRemaining = dashboardMetrics.totalIterationsRequired;
    const countdown = getExamCountdownMetrics(totalIterationsRemaining);
    const todayTrackerObj = queueEngine.getTodayTracker();

    const globalAnalytics = studyTracker.getGlobalAnalytics();
    let speedSec = 45;
    if (periodAnalytics.totalQuestions > 0 && periodAnalytics.avgTimePerQuestion > 0) {
      speedSec = periodAnalytics.avgTimePerQuestion;
    } else if (globalAnalytics.totalQuestions > 0 && globalAnalytics.avgTimePerQuestion > 0) {
      speedSec = globalAnalytics.avgTimePerQuestion;
    }
    speedSec = Math.round(speedSec * 10) / 10;

    if (currentStatsRange === 'today') {
      if (selectedDayOffset === 0) {
        const remainingToday = Math.max(0, countdown.dailyIterationsRequired - todayTrackerObj.count);
        const totalSecNeededToday = Math.round(remainingToday * speedSec);

        if (finishLabelEl) finishLabelEl.textContent = 'Temps pour Finir (Auj.)';

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
            : 'Aucun QCM enregistré ce jour-là';
        }
      }
    } else {
      const totalSecNeededOverall = Math.round(totalIterationsRemaining * speedSec);
      const dailySecNeededForExam = Math.round(countdown.dailyIterationsRequired * speedSec);

      const formattedTotalTime = formatDuration(totalSecNeededOverall);
      const formattedDailyTime = formatDuration(dailySecNeededForExam);

      if (finishLabelEl) {
        finishLabelEl.textContent = (currentStatsRange === 'all')
          ? 'Temps Requis (Total & Jour)'
          : `Temps Requis (${rangeLabel})`;
      }

      if (totalIterationsRemaining === 0) {
        finishValEl.innerHTML = `<span style="color:var(--emerald);font-weight:700;">Programme Terminé ! 🎉</span>`;
        if (finishSubEl) {
          finishSubEl.textContent = 'Toutes les questions maîtrisées (100%)';
        }
      } else {
        finishValEl.innerHTML = `<span style="font-weight:700;">${formattedDailyTime}</span><small style="font-size:0.8rem;font-weight:600;color:var(--text-muted);">/j</small> • <span style="font-weight:700;">${formattedTotalTime}</span><small style="font-size:0.8rem;font-weight:600;color:var(--text-muted);"> total</small>`;
        if (finishSubEl) {
          finishSubEl.textContent = `Total : ${formattedTotalTime} (${formatNumber(totalIterationsRemaining)} QCM • ${countdown.hasDate ? 'J-' + countdown.daysLeft : 'échéance libre'})`;
        }
      }
    }
  }

  renderStatsHeatmap(studyTracker.getRawHistory());

  let chartDays;
  if (currentStatsRange === 'today') {
    chartDays = [];
    for (let i = 6; i >= 0; i--) {
      const dStr = getDateStrWithOffset(selectedDayOffset - i);
      const rec = (studyTracker.history && studyTracker.history[dStr]) ? studyTracker.history[dStr] : {
        dateStr: dStr,
        totalQuestions: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        totalTimeSeconds: 0,
        sessionsCount: 0,
        avgTimePerQuestion: 0
      };
      chartDays.push(rec);
    }
  } else {
    chartDays = rangeDays;
  }

  renderStatsActivityChart(chartDays);
  renderStatsVelocityAndProjection(periodAnalytics, rangeLabel);

  lastRenderedChapterTotals = periodAnalytics.chapterTotals || {};
  lastRenderedPeriodLabel = rangeLabel;
  renderStatsChapters(lastRenderedChapterTotals, lastRenderedPeriodLabel);

  renderStatsTimeline(rangeDays);
  renderLessonTrackerUI();
  switchStatsSubpage(getCurrentStatsSubpage(), false);
  refreshLucide();
}

function renderStatsHeatmap(history) {
  const container = document.getElementById('stats-heatmap-container');
  if (!container) return;

  const now = new Date();
  const cellWidth = 14;
  const cellHeight = 14;
  const gap = 4;
  const leftMargin = 34;
  const topMargin = 22;

  const width = leftMargin + (9 * (cellWidth + gap)) + 10;
  const height = topMargin + (7 * (cellHeight + gap)) + 6;

  const todayDayOfWeek = (now.getDay() + 6) % 7;
  const startMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (8 * 7 + todayDayOfWeek));

  let svgContent = `<svg class="heatmap-svg" viewBox="0 0 ${width} ${height}" style="max-width:100%;height:auto;">`;

  const dayNames = ['Lun', '', 'Mer', '', 'Ven', '', 'Dim'];
  dayNames.forEach((name, idx) => {
    if (name) {
      const y = topMargin + idx * (cellHeight + gap) + 11;
      svgContent += `<text x="4" y="${y}" fill="#64748b" font-size="9" font-family="var(--font-body)">${name}</text>`;
    }
  });

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  for (let col = 0; col < 9; col++) {
    for (let row = 0; row < 7; row++) {
      const cellDate = new Date(startMonday.getFullYear(), startMonday.getMonth(), startMonday.getDate() + (col * 7 + row));
      const cellMidnight = new Date(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate()).getTime();

      const x = leftMargin + col * (cellWidth + gap);
      const y = topMargin + row * (cellHeight + gap);

      if (cellMidnight > todayMidnight) {
        continue;
      }

      const year = cellDate.getFullYear();
      const month = String(cellDate.getMonth() + 1).padStart(2, '0');
      const day = String(cellDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const dayData = history[dateStr] || null;

      const total = dayData ? (dayData.totalQuestions || 0) : 0;
      const correct = dayData ? (dayData.correctAnswers || 0) : 0;
      const wrong = dayData ? (dayData.wrongAnswers || 0) : 0;
      const timeSec = dayData ? (dayData.totalTimeSeconds || 0) : 0;

      let color = '#121d33';
      let stroke = 'rgba(255,255,255,0.06)';
      if (total >= 80) { color = '#00d4ff'; stroke = 'none'; }
      else if (total >= 40) { color = '#10b981'; stroke = 'none'; }
      else if (total >= 15) { color = '#047857'; stroke = 'none'; }
      else if (total >= 1) { color = '#064e3b'; stroke = 'none'; }

      const dateLabel = cellDate.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
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

function renderStatsActivityChart(rangeDays) {
  const container = document.getElementById('stats-activity-chart');
  if (!container) return;

  const totalRange = rangeDays.length;
  const chartTitleEl = document.getElementById('activity-chart-title');
  if (chartTitleEl) {
    if (currentStatsRange === 'today') {
      chartTitleEl.textContent = (selectedDayOffset === 0)
        ? 'Activité des 7 derniers jours (Volume, Justes vs Fautes & Vélocité)'
        : `Activité sur 7 jours jusqu'à ${getDayLabelForOffset(selectedDayOffset)} (Volume, Justes vs Fautes & Vélocité)`;
    } else if (currentStatsRange === 'custom') {
      const firstStr = rangeDays[0]?.dateStr ? formatDateFr(rangeDays[0].dateStr) : '';
      const lastStr = rangeDays[rangeDays.length - 1]?.dateStr ? formatDateFr(rangeDays[rangeDays.length - 1].dateStr) : '';
      chartTitleEl.textContent = `Activité Personnalisée (${firstStr} ➔ ${lastStr})`;
    } else if (['7', '14', '21', '28', '30'].includes(currentStatsRange)) {
      chartTitleEl.textContent = `Activité des ${currentStatsRange} derniers jours (Volume, Justes vs Fautes & Vélocité)`;
    } else if (totalRange <= 30) {
      chartTitleEl.textContent = `Activité des ${totalRange} derniers jours`;
    } else {
      chartTitleEl.textContent = "Historique complet d'activité";
    }
  }

  if (rangeDays.length === 0) {
    container.innerHTML = `<div class="stats-empty-state"><p>Aucune donnée d'entraînement sur cette période.</p></div>`;
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

  const gridSteps = 4;
  for (let s = 0; s <= gridSteps; s++) {
    const yVal = padTop + (plotH / gridSteps) * s;
    const qValue = Math.round(maxQ - (maxQ / gridSteps) * s);
    const velValue = Math.round(maxVel - (maxVel / gridSteps) * s);

    svg += `<line x1="${padLeft}" y1="${yVal}" x2="${svgWidth - padRight}" y2="${yVal}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" />`;
    svg += `<text x="${padLeft - 8}" y="${yVal + 4}" fill="#64748b" font-size="9" text-anchor="end" font-family="var(--font-body)">${qValue}</text>`;
    if (s < gridSteps) {
      svg += `<text x="${svgWidth - padRight + 8}" y="${yVal + 4}" fill="#f59e0b" font-size="9" text-anchor="start" font-family="var(--font-body)">${velValue}s</text>`;
    }
  }

  const N = rangeDays.length;
  const colWidth = plotW / N;
  const barWidth = Math.max(6, Math.min(36, colWidth * 0.65));
  const velocityPoints = [];

  rangeDays.forEach((d, i) => {
    const xCenter = padLeft + (i + 0.5) * colWidth;
    const xBar = xCenter - barWidth / 2;

    const total = d.totalQuestions || 0;
    const cor = d.correctAnswers || 0;
    const wr = d.wrongAnswers || 0;
    const speed = d.avgTimePerQuestion || 0;

    const hCor = (cor / maxQ) * plotH;
    const hWr = (wr / maxQ) * plotH;

    const yCor = padTop + plotH - hCor;
    const yWr = yCor - hWr;

    const tooltip = `${formatDateFr(d.dateStr)} : ${total} QCM (${cor} justes, ${wr} fautes) • Vitesse : ${speed || '--'}s/QCM`;

    svg += `<rect class="chart-col-bg" x="${xBar - 2}" y="${padTop}" width="${barWidth + 4}" height="${plotH}" rx="4" fill="rgba(255,255,255,0.02)" />`;

    if (total > 0) {
      if (cor > 0) {
        svg += `
          <rect class="chart-bar-rect" x="${xBar}" y="${yCor}" width="${barWidth}" height="${Math.max(2, hCor)}" rx="2" fill="var(--emerald)">
            <title>${escapeHtml(tooltip)}</title>
          </rect>
        `;
      }
      if (wr > 0) {
        svg += `
          <rect class="chart-bar-rect" x="${xBar}" y="${yWr}" width="${barWidth}" height="${Math.max(2, hWr)}" rx="2" fill="var(--rose)">
            <title>${escapeHtml(tooltip)}</title>
          </rect>
        `;
      }
      if (barWidth >= 16 || N <= 10) {
        const yTopBar = (cor > 0 && wr > 0) ? yWr : (cor > 0 ? yCor : yWr);
        svg += `
          <text x="${xCenter}" y="${yTopBar - 6}" fill="#00d4ff" font-size="${barWidth < 20 ? 9 : 10}" font-weight="700" text-anchor="middle" font-family="'Outfit', sans-serif">${total}</text>
        `;
      }
    } else {
      svg += `
        <rect class="chart-bar-rect" x="${xBar}" y="${padTop + plotH - 5}" width="${barWidth}" height="5" rx="2.5" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)" stroke-width="1">
          <title>${escapeHtml(formatDateFr(d.dateStr))} : Aucun entraînement (0 QCM)</title>
        </rect>
      `;
      if (N <= 10) {
        svg += `<text x="${xCenter}" y="${padTop + plotH - 9}" fill="#64748b" font-size="9" text-anchor="middle" font-family="var(--font-body)">0</text>`;
      }
    }

    if (speed > 0) {
      const yVel = padTop + plotH - (speed / maxVel) * plotH;
      velocityPoints.push({ x: xCenter, y: yVel, speed, dateStr: d.dateStr });
    }

    const shouldShowLabel = (N <= 10) || (N <= 31 && i % 3 === 0) || (i === N - 1);
    if (shouldShowLabel) {
      let labelText = '';
      let isSelectedDay = false;
      if (d.dateStr) {
        const todayStr = getDateStrWithOffset(0);
        const hierStr = getDateStrWithOffset(-1);
        const activeOffsetStr = getDateStrWithOffset(selectedDayOffset);
        isSelectedDay = (d.dateStr === activeOffsetStr);

        if (N <= 10) {
          if (d.dateStr === todayStr) {
            labelText = 'Auj.';
          } else if (d.dateStr === hierStr) {
            labelText = 'Hier';
          } else {
            const parts = d.dateStr.split('-').map(Number);
            const dt = new Date(parts[0], parts[1] - 1, parts[2]);
            const dayName = dt.toLocaleDateString('fr-FR', { weekday: 'short' });
            labelText = `${dayName} ${parts[2]}`;
          }
        } else {
          labelText = d.dateStr.slice(5).replace('-', '/');
        }
      }
      const labelColor = isSelectedDay ? '#00d4ff' : '#94a3b8';
      const labelWeight = isSelectedDay ? '700' : '500';
      svg += `<text x="${xCenter}" y="${svgHeight - padBottom + 16}" fill="${labelColor}" font-size="${N > 25 ? 9 : 10}" font-weight="${labelWeight}" text-anchor="middle" font-family="var(--font-body)">${labelText}</text>`;
    }
  });

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

    const targetDeadlineText = countdown.hasDate ? `avant le ${countdown.examDateStr} (J-${countdown.daysLeft})` : "avant l'échéance de l'examen";
    if (daysNeeded <= (countdown.daysLeft || 999)) {
      projTextEl.innerHTML = `<strong>🏆 Cadence excellente !</strong> Au rythme (${cadenceNote}) de <strong>${effectiveCadence} QCM/jour</strong>, vous aurez validé l'intégralité du programme en <strong>${daysNeeded} jours</strong> (vers le ${estDateStr}), soit ${targetDeadlineText} !`;
    } else {
      projTextEl.innerHTML = `<strong>⚠️ Recommandation Concours :</strong> Au rythme (${cadenceNote}) de ${effectiveCadence} QCM/j, il faudrait ${daysNeeded} jours pour tout nettoyer. Pour franchir la ligne d'arrivée ${targetDeadlineText}, maintenez la cadence cible de <strong>${countdown.dailyIterationsRequired} QCM/jour</strong>.`;
    }
  } else {
    const targetExamLabel = countdown.hasDate ? `vers l'examen du ${countdown.fullFormattedDate}` : 'vers votre examen';
    projTextEl.innerHTML = `<em>Répondez à vos premiers QCM pour activer la projection personnalisée ${targetExamLabel}. Cadence cible recommandée : <strong>${countdown.dailyIterationsRequired} QCM/jour</strong>.</em>`;
  }
}

export function renderStatsChapters(chapterTotals = {}, periodLabel = '') {
  const container = document.getElementById('stats-chapters-breakdown');
  const badgeEl = document.getElementById('course-tracker-summary-badge');
  const titleEl = document.getElementById('course-tracker-title');
  if (!container) return;

  const activeMod = getActiveModule();
  const modTitle = activeMod ? activeMod.title : 'du module';
  const chTotalCount = appState.allChapters.length;

  const btnCmodeGlobal = document.getElementById('btn-cmode-global');
  if (btnCmodeGlobal) {
    btnCmodeGlobal.textContent = `Tous les cours (${chTotalCount})`;
    btnCmodeGlobal.title = `Progression globale sur l'ensemble des ${chTotalCount} cours`;
  }

  const query = (courseTrackerSearchQuery || '').trim().toLowerCase();

  if (courseTrackerMode === 'global') {
    if (titleEl) titleEl.textContent = 'Suivi Global : Questions par Cours';
    let totalMasteredAll = 0;

    let list = appState.allChapters.map(ch => {
      const chQuestions = appState.allQuestions.filter(q => q.chapterId === ch.id);
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

    list.sort((a, b) => b.masteredCount - a.masteredCount || b.attemptedCount - a.attemptedCount || a.title.localeCompare(b.title));

    if (badgeEl) {
      badgeEl.textContent = `${list.length}/${chTotalCount} cours • ${totalMasteredAll}/${appState.allQuestions.length} maîtrisés`;
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
    if (titleEl) titleEl.textContent = `Suivi des Questions (${periodLabel || 'Période'})`;
    const entries = Object.entries(chapterTotals).filter(([_, st]) => (st.correct + st.wrong) > 0);

    let list = entries.map(([chId, st]) => {
      const ch = appState.chaptersMap.get(chId) || { title: chId, count: 0 };
      const chQuestions = appState.allQuestions.filter(q => q.chapterId === chId);
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

    list.sort((a, b) => b.totalDone - a.totalDone || b.pct - a.pct);

    const totalQPeriod = list.reduce((sum, item) => sum + item.totalDone, 0);

    if (badgeEl) {
      badgeEl.textContent = `${list.length} cours • ${totalQPeriod} QCM faits`;
    }

    if (list.length === 0) {
      container.innerHTML = `
        <div class="course-empty-period-box">
          <div class="empty-period-icon"><i data-lucide="book-marked"></i></div>
          <div class="empty-period-title">Aucun QCM répondu sur cette période (${escapeHtml(periodLabel)})</div>
          <div class="empty-period-text">Consultez la progression globale de vos ${chTotalCount} cours (${escapeHtml(modTitle)}) :</div>
          <button type="button" class="btn-switch-cmode-global" id="btn-trigger-global-mode">
            <i data-lucide="layers" style="width:14px;height:14px;"></i>
            <span>Voir le suivi global des ${chTotalCount} cours</span>
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
