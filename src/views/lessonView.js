// ============================================================================
// Suivi des Cours & Chronomètre d'Étude par Leçon
// ============================================================================
import { appState, navigateToView } from '../state/appState.js';
import { lessonTracker, identifySessionModule } from '../services/lessonTracker.js';
import {
  getActiveModuleId,
  getActiveModule,
  findModuleById
} from '../services/moduleCatalog.js';
import {
  escapeHtml,
  getDateStrWithOffset,
  getDayLabelForOffset,
  formatDuration,
  formatDateFr,
  formatDigitalClockTime
} from '../utils/formatters.js';
import {
  refreshLucide,
  showAppToast,
  showConfirmModal
} from '../utils/uiDialogs.js';

let currentLessonSelected = {
  name: '',
  chapterId: null
};
let lessonTimerInterval = null;
let currentStatsSubpage = 'qcm'; // 'qcm' | 'lessons'
let isLessonOutsideClickBound = false;

let currentLessonStatsRange = 'today'; // 'today' | '7' | '14' | '21' | '28' | '30' | 'all' | 'custom'
let selectedLessonDayOffset = 0;
let customLessonStatsStart = '';
let customLessonStatsEnd = '';
let currentLessonOffsetSeconds = 0;

let lessonDistModuleFilter = getActiveModuleId();
let lessonMatrixModuleFilter = getActiveModuleId();
let lessonSummaryModuleFilter = getActiveModuleId();
let lessonRecentModuleFilter = getActiveModuleId();

export function getCurrentStatsSubpage() {
  return currentStatsSubpage;
}

export function resetLessonViewFilters(moduleId = null) {
  const modId = moduleId || getActiveModuleId();
  currentLessonSelected = { name: '', chapterId: null };
  const searchInput = document.getElementById('lesson-search-input');
  if (searchInput) searchInput.value = '';
  const activeNameEl = document.getElementById('active-lesson-name');
  if (activeNameEl) activeNameEl.textContent = 'Aucune leçon choisie';
  const clearBtn = document.getElementById('btn-clear-lesson-input');
  if (clearBtn) clearBtn.style.display = 'none';

  lessonDistModuleFilter = modId;
  lessonMatrixModuleFilter = modId;
  lessonSummaryModuleFilter = modId;
  lessonRecentModuleFilter = modId;
}

function getModuleDisplayMeta(modId) {
  if (!modId || modId === 'all') {
    return { title: 'Tous modules', shortTitle: 'Tous', pillClass: 'mod-pedia' };
  }
  const found = findModuleById(modId);
  if (modId === 'psychiatrie' || modId === 'psychiatrie_5') {
    return { title: found?.title || 'Psychiatrie', shortTitle: 'Psy', pillClass: 'mod-psy' };
  }
  if (modId === 'pediatrie') {
    return { title: found?.title || 'Pédiatrie', shortTitle: 'Pédia', pillClass: 'mod-pedia' };
  }
  const title = found?.title || modId;
  return { title, shortTitle: title.slice(0, 6), pillClass: 'mod-pedia' };
}

export function switchStatsSubpage(subtab, animate = true) {
  currentStatsSubpage = subtab;
  const btnQcm = document.getElementById('btn-subnav-qcm');
  const btnLessons = document.getElementById('btn-subnav-lessons');
  const pageQcm = document.getElementById('stats-subpage-qcm');
  const pageLessons = document.getElementById('stats-subpage-lessons');
  const rangeWrapQcm = document.getElementById('stats-qcm-range-wrap');
  const rangeWrapLessons = document.getElementById('stats-lesson-range-wrap');

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

    if (rangeWrapQcm) rangeWrapQcm.style.display = 'flex';
    if (rangeWrapLessons) rangeWrapLessons.style.display = 'none';
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

    if (rangeWrapQcm) rangeWrapQcm.style.display = 'none';
    if (rangeWrapLessons) rangeWrapLessons.style.display = 'flex';
    renderLessonTrackerUI();
  }
  refreshLucide();
}

function getLessonFilteredSessions(range = currentLessonStatsRange, offset = selectedLessonDayOffset, customStart = customLessonStatsStart, customEnd = customLessonStatsEnd) {
  const sessions = lessonTracker ? lessonTracker.getSessions() : [];
  if (range === 'today') {
    const targetDateStr = getDateStrWithOffset(offset);
    return sessions.filter(s => s.dateStr === targetDateStr);
  }
  if (range === 'all') {
    return [...sessions];
  }
  if (range === 'custom') {
    let start = customStart || getDateStrWithOffset(-7);
    let end = customEnd || getDateStrWithOffset(0);
    if (start > end) [start, end] = [end, start];
    return sessions.filter(s => s.dateStr >= start && s.dateStr <= end);
  }
  const numDays = parseInt(range, 10) || 7;
  const cutoff = getDateStrWithOffset(-(numDays - 1));
  const today = getDateStrWithOffset(0);
  return sessions.filter(s => s.dateStr >= cutoff && s.dateStr <= today);
}

function buildDailySeriesBetween(startDateStr, endDateStr, sessions) {
  const partsStart = startDateStr.split('-').map(Number);
  const partsEnd = endDateStr.split('-').map(Number);
  const dStart = new Date(partsStart[0], partsStart[1] - 1, partsStart[2]);
  const dEnd = new Date(partsEnd[0], partsEnd[1] - 1, partsEnd[2]);
  const dailyData = [];

  const cur = new Date(dStart);
  while (cur <= dEnd) {
    const year = cur.getFullYear();
    const month = String(cur.getMonth() + 1).padStart(2, '0');
    const day = String(cur.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const daySessions = sessions.filter(s => s.dateStr === dateStr);
    const daySeconds = daySessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
    const dayNameShort = cur.toLocaleDateString('fr-FR', { weekday: 'short' });
    const dayNum = cur.getDate();

    dailyData.push({
      dateStr,
      daySeconds,
      dayLabel: `${dayNameShort} ${dayNum}`,
      dateObj: new Date(cur),
      sessionsCount: daySessions.length
    });
    cur.setDate(cur.getDate() + 1);
  }
  return dailyData;
}

function getLessonRangeDailyData(range = currentLessonStatsRange, offset = selectedLessonDayOffset, customStart = customLessonStatsStart, customEnd = customLessonStatsEnd) {
  const sessions = lessonTracker ? lessonTracker.getSessions() : [];
  const now = new Date();

  if (range === 'today') {
    const targetDateStr = getDateStrWithOffset(offset);
    const parts = targetDateStr.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const daySessions = sessions.filter(s => s.dateStr === targetDateStr);
    const daySeconds = daySessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
    return [{
      dateStr: targetDateStr,
      daySeconds,
      dayLabel: getDayLabelForOffset(offset),
      dateObj: d,
      sessionsCount: daySessions.length
    }];
  }

  if (range === 'custom') {
    const todayStr = getDateStrWithOffset(0);
    let start = customStart || getDateStrWithOffset(-7);
    let end = customEnd || todayStr;
    if (start > end) [start, end] = [end, start];
    return buildDailySeriesBetween(start, end, sessions);
  }

  if (range === 'all') {
    const validDates = sessions.map(s => s.dateStr).filter(Boolean).sort();
    let start = validDates[0] || getDateStrWithOffset(-13);
    const end = getDateStrWithOffset(0);
    if (start > end) start = end;
    return buildDailySeriesBetween(start, end, sessions);
  }

  const dailyData = [];
  const numDays = parseInt(range, 10) || 7;
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (offset || 0) - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const daySessions = sessions.filter(s => s.dateStr === dateStr);
    const daySeconds = daySessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
    const isToday = ((offset || 0) === 0 && i === 0);
    const isHier = ((offset || 0) === -1 && i === 0);
    const dayNameShort = d.toLocaleDateString('fr-FR', { weekday: 'short' });
    const dayNum = d.getDate();

    let dayLabel = `${dayNameShort} ${dayNum}`;
    if (isToday) dayLabel = 'Auj.';
    else if (isHier) dayLabel = 'Hier';

    dailyData.push({
      dateStr,
      daySeconds,
      dayLabel,
      dateObj: d,
      sessionsCount: daySessions.length
    });
  }
  return dailyData;
}

export function updateLessonTimerTick() {
  const active = lessonTracker ? lessonTracker.activeTimer : null;
  const headerBadge = document.getElementById('active-lesson-header-badge');
  const headerName = document.getElementById('header-lesson-name');
  const headerTime = document.getElementById('header-lesson-time');

  const digitalClock = document.getElementById('lesson-digital-clock');
  const clockDot = document.getElementById('lesson-clock-dot');
  const statusText = document.getElementById('lesson-status-text');

  if (active && active.isRunning) {
    const elapsedSec = lessonTracker.getElapsedTimeSeconds();
    const formatted = formatDigitalClockTime(elapsedSec);

    if (headerBadge) {
      headerBadge.style.display = 'inline-flex';
      if (headerName) headerName.textContent = active.lessonName;
      if (headerTime) headerTime.textContent = formatted;
    }

    const subnavTimerPill = document.getElementById('subnav-active-lesson-time');
    if (subnavTimerPill) {
      subnavTimerPill.style.display = 'inline-block';
      subnavTimerPill.textContent = formatted;
    }

    if (digitalClock) digitalClock.textContent = formatted;
    if (clockDot) {
      clockDot.className = active.isPaused ? 'clock-status-dot status-paused' : 'clock-status-dot status-running';
    }
    if (statusText) {
      statusText.textContent = active.isPaused ? 'En pause' : 'Chronomètre en cours...';
    }
  } else {
    if (headerBadge) headerBadge.style.display = 'none';
    const subnavTimerPill = document.getElementById('subnav-active-lesson-time');
    if (subnavTimerPill) subnavTimerPill.style.display = 'none';

    if (digitalClock) {
      digitalClock.textContent = currentLessonOffsetSeconds > 0
        ? formatDigitalClockTime(currentLessonOffsetSeconds)
        : '00:00:00';
    }
    if (clockDot) clockDot.className = 'clock-status-dot status-idle';
    if (statusText) {
      statusText.textContent = currentLessonOffsetSeconds > 0
        ? `Prêt (Départ : ${formatDigitalClockTime(currentLessonOffsetSeconds)})`
        : 'Prêt à démarrer';
    }
  }
}

function renderLessonAnalytics(rangeStr = currentLessonStatsRange) {
  currentLessonStatsRange = rangeStr;
  const sessions = lessonTracker ? lessonTracker.getSessions() : [];
  const periodSessions = getLessonFilteredSessions(currentLessonStatsRange, selectedLessonDayOffset, customLessonStatsStart, customLessonStatsEnd);
  const dailyData = getLessonRangeDailyData(currentLessonStatsRange, selectedLessonDayOffset, customLessonStatsStart, customLessonStatsEnd);
  const summaries = lessonTracker ? lessonTracker.getLessonSummaries() : [];

  let chartDailyData;
  let chartRangeToRender;
  if (currentLessonStatsRange === 'today') {
    chartRangeToRender = '7';
    chartDailyData = getLessonRangeDailyData('7', selectedLessonDayOffset, customLessonStatsStart, customLessonStatsEnd);
  } else {
    chartRangeToRender = currentLessonStatsRange;
    chartDailyData = dailyData;
  }

  const chartTitleEl = document.getElementById('lesson-daily-chart-title');
  const periodBadgeEl = document.getElementById('lesson-chart-period-badge');

  let periodTitleText = "Historique Quotidien d'Étude des Cours";
  let periodBadgeText = "Aujourd'hui";

  if (currentLessonStatsRange === 'today') {
    const label = getDayLabelForOffset(selectedLessonDayOffset);
    periodTitleText = (selectedLessonDayOffset === 0)
      ? "Historique Quotidien d'Étude des Cours (7 derniers jours)"
      : `Historique Quotidien d'Étude des Cours (7 jours jusqu'à ${label})`;
    periodBadgeText = '7 jours';
  } else if (currentLessonStatsRange === 'custom') {
    const sStr = customLessonStatsStart ? formatDateFr(customLessonStatsStart) : '';
    const eStr = customLessonStatsEnd ? formatDateFr(customLessonStatsEnd) : '';
    periodTitleText = `Temps d'Étude des Cours — Personnalisé (${sStr} ➔ ${eStr})`;
    periodBadgeText = `${sStr} ➔ ${eStr}`;
  } else if (currentLessonStatsRange === 'all') {
    periodTitleText = "Historique Complet d'Étude des Cours";
    periodBadgeText = "Tout l'historique";
  } else {
    periodTitleText = `Temps d'Étude des Cours — ${currentLessonStatsRange} derniers jours`;
    periodBadgeText = `${currentLessonStatsRange} jours`;
  }

  if (chartTitleEl) chartTitleEl.textContent = periodTitleText;
  if (periodBadgeEl) periodBadgeEl.textContent = periodBadgeText;

  const kpiTotalTime = document.getElementById('kpi-lesson-total-time');
  const kpiTotalSub = document.getElementById('kpi-lesson-total-sub');
  const kpiTodayTime = document.getElementById('kpi-lesson-today-time');
  const kpi7dSub = document.getElementById('kpi-lesson-7d-sub');
  const kpiAvgTime = document.getElementById('kpi-lesson-avg-time');
  const kpiAvgSub = document.getElementById('kpi-lesson-avg-sub');
  const kpiCoverageVal = document.getElementById('kpi-lesson-coverage-val');
  const kpiCoverageSub = document.getElementById('kpi-lesson-coverage-sub');

  const periodSeconds = periodSessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
  const totalSecondsAll = sessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);

  const pHrs = Math.floor(periodSeconds / 3600);
  const pMins = Math.floor((periodSeconds % 3600) / 60);

  if (kpiTotalTime) {
    kpiTotalTime.textContent = periodSeconds > 0 ? `${pHrs}h ${String(pMins).padStart(2, '0')}` : '0h 00';
  }
  if (kpiTotalSub) {
    if (currentLessonStatsRange === 'all') {
      kpiTotalSub.textContent = `${sessions.length} session${sessions.length > 1 ? 's' : ''} enregistrée${sessions.length > 1 ? 's' : ''}`;
    } else {
      const allHrs = Math.floor(totalSecondsAll / 3600);
      kpiTotalSub.textContent = `${periodSessions.length} session${periodSessions.length > 1 ? 's' : ''} sur la période • Total : ${allHrs}h`;
    }
  }

  const todayDateStr = lessonTracker.getTodayDateStr();
  const todaySeconds = sessions
    .filter(s => s.dateStr === todayDateStr)
    .reduce((acc, s) => acc + (s.durationSeconds || 0), 0);

  const sevenDaysAgoMs = Date.now() - (7 * 86400000);
  const sevenDaysSeconds = sessions
    .filter(s => (s.endTime || 0) >= sevenDaysAgoMs)
    .reduce((acc, s) => acc + (s.durationSeconds || 0), 0);

  if (kpiTodayTime) {
    const todayHrs = Math.floor(todaySeconds / 3600);
    const todayMins = Math.floor((todaySeconds % 3600) / 60);
    kpiTodayTime.textContent = todaySeconds > 0 ? `${todayHrs}h ${String(todayMins).padStart(2, '0')}` : '0h 00';
  }
  if (kpi7dSub) {
    const s7Hrs = Math.floor(sevenDaysSeconds / 3600);
    const s7Mins = Math.floor((sevenDaysSeconds % 3600) / 60);
    kpi7dSub.textContent = `7 derniers jours : ${s7Hrs}h ${String(s7Mins).padStart(2, '0')}`;
  }

  if (kpiAvgTime) {
    if (periodSessions.length === 0) {
      kpiAvgTime.textContent = '--';
    } else {
      const avgSec = Math.round(periodSeconds / periodSessions.length);
      const avgH = Math.floor(avgSec / 3600);
      const avgM = Math.floor((avgSec % 3600) / 60);
      kpiAvgTime.textContent = avgH > 0 ? `${avgH}h ${String(avgM).padStart(2, '0')}` : `${avgM} min`;
    }
  }
  if (kpiAvgSub) {
    kpiAvgSub.textContent = periodSessions.length > 0 ? `${periodSessions.length} session${periodSessions.length > 1 ? 's' : ''} analysée${periodSessions.length > 1 ? 's' : ''}` : 'Focus régulier';
  }

  const allChs = (appState.allChapters && appState.allChapters.length > 0)
    ? appState.allChapters
    : ((typeof window !== 'undefined' && window.PEDIA_CHAPTERS) || []);
  const studiedChCount = allChs.filter(ch => {
    return summaries.some(s => (s.chapterId && s.chapterId === ch.id) || (s.lessonName && s.lessonName.trim().toLowerCase() === ch.title.trim().toLowerCase()));
  }).length;

  const coveragePct = allChs.length > 0 ? Math.round((studiedChCount / allChs.length) * 100) : 0;
  if (kpiCoverageVal) {
    kpiCoverageVal.textContent = `${studiedChCount} / ${allChs.length}`;
  }
  if (kpiCoverageSub) {
    kpiCoverageSub.textContent = `${coveragePct}% des cours travaillés`;
  }

  const matrixTitleEl = document.getElementById('lesson-matrix-title');
  if (matrixTitleEl) {
    matrixTitleEl.textContent = `Couverture du Programme (${allChs.length} Chapitres)`;
  }

  renderLessonDailyChart(chartRangeToRender, chartDailyData);
  renderLessonDistribution(lessonDistModuleFilter);
  renderLessonChaptersMatrix(lessonMatrixModuleFilter);
}

function renderLessonDailyChart(_rangeStr, dailyData) {
  const container = document.getElementById('lesson-daily-chart-container');
  if (!container) return;

  if (!dailyData || dailyData.length === 0) {
    container.innerHTML = '<div class="stats-empty-state"><p>Aucune donnée disponible pour cette période.</p></div>';
    return;
  }

  const daysCount = dailyData.length;
  const maxSeconds = Math.max(...dailyData.map(d => d.daySeconds || 0), 3600);
  const svgWidth = 800;
  const svgHeight = 220;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 25;
  const padBottom = 40;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const maxHrs = Math.max(1, Math.ceil(maxSeconds / 3600));

  let svgHtml = `<svg class="activity-chart-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" style="max-width:100%;height:auto;display:block;">`;

  const gridSteps = [0, maxHrs / 2, maxHrs];
  gridSteps.forEach(hVal => {
    const yRatio = maxHrs > 0 ? (hVal / maxHrs) : 0;
    const yPos = padTop + chartH - (yRatio * chartH);
    svgHtml += `
      <line x1="${padLeft}" y1="${yPos}" x2="${svgWidth - padRight}" y2="${yPos}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" />
      <text x="${padLeft - 8}" y="${yPos + 4}" fill="#64748b" font-size="10" text-anchor="end" font-family="var(--font-body)">${hVal % 1 === 0 ? hVal : hVal.toFixed(1)}h</text>
    `;
  });

  const totalPeriodSeconds = dailyData.reduce((acc, d) => acc + (d.daySeconds || 0), 0);

  if (daysCount === 1) {
    const item = dailyData[0];
    const barWidth = 64;
    const xCenter = padLeft + (chartW / 2);
    const x = xCenter - (barWidth / 2);
    const barHeight = (item.daySeconds / (maxHrs * 3600)) * chartH;
    const y = padTop + chartH - barHeight;

    const formattedTime = formatDuration(item.daySeconds);
    const dateLabel = item.dateObj ? item.dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : item.dateStr;
    const tooltip = item.daySeconds > 0
      ? `${dateLabel} : ${formattedTime} d'étude (${item.sessionsCount || 0} session${(item.sessionsCount || 0) > 1 ? 's' : ''})`
      : `${dateLabel} : Aucun temps de cours enregistré`;

    const barColor = item.daySeconds > 0 ? 'url(#lessonBarGrad)' : 'rgba(255,255,255,0.04)';
    const barStroke = item.daySeconds > 0 ? '#10b981' : 'rgba(255,255,255,0.08)';

    svgHtml += `
      <rect class="lesson-bar-rect" x="${x}" y="${item.daySeconds > 0 ? y : (padTop + chartH - 4)}" width="${barWidth}" height="${Math.max(barHeight, 4)}" rx="6"
            fill="${barColor}" stroke="${barStroke}" stroke-width="1.5">
        <title>${escapeHtml(tooltip)}</title>
      </rect>
    `;

    if (item.daySeconds > 0) {
      const hrs = Math.floor(item.daySeconds / 3600);
      const mins = Math.floor((item.daySeconds % 3600) / 60);
      const label = hrs > 0 ? `${hrs}h ${String(mins).padStart(2, '0')}` : `${mins} min`;
      svgHtml += `<text x="${xCenter}" y="${y - 8}" fill="#00d4ff" font-size="12" font-weight="700" text-anchor="middle" font-family="'Outfit', sans-serif">${label}</text>`;
    } else {
      svgHtml += `<text x="${xCenter}" y="${padTop + chartH / 2}" fill="#64748b" font-size="12" text-anchor="middle" font-family="var(--font-body)">Aucune session enregistrée ce jour-là</text>`;
    }

    svgHtml += `<text x="${xCenter}" y="${padTop + chartH + 20}" fill="#94a3b8" font-size="12" font-weight="600" text-anchor="middle" font-family="var(--font-body)">${escapeHtml(item.dayLabel)} (${formatDateFr(item.dateStr)})</text>`;
  } else {
    const colStep = chartW / daysCount;
    const barWidth = Math.min(36, Math.max(6, Math.floor(colStep * 0.65)));

    dailyData.forEach((item, idx) => {
      const xCenter = padLeft + idx * colStep + (colStep / 2);
      const x = xCenter - (barWidth / 2);
      const barHeight = (item.daySeconds / (maxHrs * 3600)) * chartH;
      const y = padTop + chartH - barHeight;

      const formattedTime = formatDuration(item.daySeconds);
      const dateLabel = item.dateObj ? item.dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : item.dateStr;
      const tooltip = item.daySeconds > 0
        ? `${dateLabel} : ${formattedTime} d'étude (${item.sessionsCount || 0} session${(item.sessionsCount || 0) > 1 ? 's' : ''})`
        : `${dateLabel} : Aucun temps de cours enregistré`;

      svgHtml += `<rect class="chart-col-bg" x="${x - 2}" y="${padTop}" width="${barWidth + 4}" height="${chartH}" rx="4" fill="rgba(255,255,255,0.02)" />`;

      if (item.daySeconds > 0) {
        svgHtml += `
          <rect class="lesson-bar-rect" x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barHeight, 4)}" rx="3"
                fill="url(#lessonBarGrad)" stroke="#10b981" stroke-width="1">
            <title>${escapeHtml(tooltip)}</title>
          </rect>
        `;

        if (barWidth >= 16 || daysCount <= 14) {
          const hrs = Math.floor(item.daySeconds / 3600);
          const mins = Math.floor((item.daySeconds % 3600) / 60);
          const label = hrs > 0 ? `${hrs}h${mins > 0 ? mins : ''}` : `${mins}m`;
          svgHtml += `<text x="${xCenter}" y="${y - 6}" fill="#00d4ff" font-size="${barWidth < 20 ? 9 : 10}" font-weight="700" text-anchor="middle" font-family="'Outfit', sans-serif">${label}</text>`;
        }
      } else {
        svgHtml += `
          <rect class="lesson-bar-rect" x="${x}" y="${padTop + chartH - 5}" width="${barWidth}" height="5" rx="2.5"
                fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)" stroke-width="1">
            <title>${escapeHtml(tooltip)}</title>
          </rect>
        `;
        if (daysCount <= 10) {
          svgHtml += `<text x="${xCenter}" y="${padTop + chartH - 9}" fill="#64748b" font-size="9" text-anchor="middle" font-family="var(--font-body)">—</text>`;
        }
      }

      const shouldShowLabel = (daysCount <= 10) || (daysCount <= 21 && idx % 2 === 0) || (daysCount <= 35 && idx % 3 === 0) || (daysCount > 35 && idx % 5 === 0) || (idx === daysCount - 1);
      if (shouldShowLabel) {
        const isCurrentDay = (item.dayLabel === 'Auj.' || (selectedLessonDayOffset === 0 && idx === daysCount - 1));
        const labelColor = isCurrentDay ? '#00d4ff' : '#94a3b8';
        const labelWeight = isCurrentDay ? '700' : '500';
        svgHtml += `<text x="${xCenter}" y="${padTop + chartH + 18}" fill="${labelColor}" font-size="${daysCount > 25 ? 9 : 11}" font-weight="${labelWeight}" text-anchor="middle" font-family="var(--font-body)">${escapeHtml(item.dayLabel)}</text>`;
      }
    });

    if (totalPeriodSeconds === 0) {
      svgHtml += `<text x="${padLeft + chartW / 2}" y="${padTop + chartH / 2}" fill="#64748b" font-size="12" text-anchor="middle" font-family="var(--font-body)">Aucune session de cours chronométrée sur cette période</text>`;
    }
  }

  svgHtml += `
    <defs>
      <linearGradient id="lessonBarGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#00d4ff" />
        <stop offset="100%" stop-color="#059669" />
      </linearGradient>
    </defs>
  </svg>`;
  container.innerHTML = svgHtml;
}

function renderLessonDistribution(filterMod = lessonDistModuleFilter) {
  const container = document.getElementById('lesson-distribution-container');
  if (!container) return;

  const summaries = lessonTracker ? lessonTracker.getLessonSummaries(filterMod) : [];
  const top10 = summaries.slice(0, 10);

  if (top10.length === 0) {
    const modLabel = filterMod === 'all' ? '' : ` en ${getModuleDisplayMeta(filterMod).title}`;
    container.innerHTML = `
      <div style="text-align:center;padding:24px 16px;color:var(--text-dim);font-size:0.85rem;">
        Aucune donnée de cours enregistrée${escapeHtml(modLabel)} pour le moment.
      </div>
    `;
    return;
  }

  const maxSec = Math.max(...top10.map(s => s.totalDurationSeconds || 0), 1);
  let html = '';

  top10.forEach(s => {
    const pct = Math.round((s.totalDurationSeconds / maxSec) * 100);
    const modMeta = getModuleDisplayMeta(s.moduleId);
    const modTag = (filterMod === 'all')
      ? `<span class="session-module-pill ${modMeta.pillClass}" style="margin-left:6px;font-size:0.62rem;padding:1px 5px;">${escapeHtml(modMeta.shortTitle)}</span>`
      : '';

    html += `
      <div class="lesson-dist-item">
        <div class="lesson-dist-header">
          <span class="lesson-dist-name" title="${escapeHtml(s.lessonName)}">
            <i data-lucide="book-open" style="width:13px;height:13px;color:var(--cyan);display:inline;margin-right:4px;"></i>
            ${escapeHtml(s.lessonName)}
            ${modTag}
          </span>
          <span class="lesson-dist-time">${formatDuration(s.totalDurationSeconds)}</span>
        </div>
        <div class="lesson-dist-bar-wrap">
          <div class="lesson-dist-bar-fill" style="width: ${pct}%;"></div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderLessonChaptersMatrix(filterMod = lessonMatrixModuleFilter) {
  const container = document.getElementById('lesson-chapters-matrix');
  const titleEl = document.getElementById('lesson-matrix-title');
  if (!container) return;

  const pediaChs = ((typeof window !== 'undefined' && window.PEDIA_CHAPTERS) || appState.allChapters || []).map(c => ({ ...c, moduleId: 'pediatrie', moduleTitle: 'Pédiatrie' }));
  const psyChs = ((typeof window !== 'undefined' && window.PSY_CHAPTERS) || []).map(c => ({ ...c, moduleId: 'psychiatrie', moduleTitle: 'Psychiatrie' }));

  let displayChapters = [];
  if (filterMod === 'pediatrie') {
    displayChapters = pediaChs;
    if (titleEl) titleEl.textContent = `Couverture Pédiatrie (${pediaChs.length} Chapitres)`;
  } else if (filterMod === 'psychiatrie') {
    displayChapters = psyChs;
    if (titleEl) titleEl.textContent = `Couverture Psychiatrie (${psyChs.length} Chapitres)`;
  } else if (filterMod !== 'all') {
    const activeMod = findModuleById(filterMod);
    displayChapters = (appState.allChapters || []).map(c => ({ ...c, moduleId: filterMod, moduleTitle: activeMod?.title || filterMod }));
    if (titleEl) titleEl.textContent = `Couverture ${activeMod?.title || filterMod} (${displayChapters.length} Chapitres)`;
  } else {
    displayChapters = [...pediaChs, ...psyChs];
    if (titleEl) titleEl.textContent = `Couverture du Programme (${displayChapters.length} Chapitres)`;
  }

  if (displayChapters.length === 0) {
    container.innerHTML = `<div style="color:var(--text-dim);font-size:0.8rem;padding:12px;">Chapitres indisponibles</div>`;
    return;
  }

  const summaries = lessonTracker ? lessonTracker.getLessonSummaries(filterMod) : [];

  function renderChapterBadge(ch, idx) {
    const chSum = summaries.find(s => (s.chapterId && s.chapterId === ch.id) || (s.lessonName && s.lessonName.trim().toLowerCase() === ch.title.trim().toLowerCase()));
    const durationSec = chSum ? chSum.totalDurationSeconds : 0;

    let levelClass = 'level-0';
    if (durationSec >= 14400) levelClass = 'level-4';
    else if (durationSec >= 7200) levelClass = 'level-3';
    else if (durationSec >= 3600) levelClass = 'level-2';
    else if (durationSec > 0) levelClass = 'level-1';

    const durationText = durationSec > 0 ? formatDuration(durationSec) : '0 min';
    const modMeta = getModuleDisplayMeta(ch.moduleId);
    const modTag = (filterMod === 'all')
      ? `<span class="session-module-pill ${modMeta.pillClass}" style="font-size:0.58rem;padding:1px 4px;margin-left:auto;">${escapeHtml(modMeta.shortTitle)}</span>`
      : '';

    return `
      <div class="chapter-matrix-badge ${levelClass}" data-chapter-id="${escapeHtml(ch.id)}" data-chapter-title="${escapeHtml(ch.title)}" data-chapter-module="${escapeHtml(ch.moduleId || 'pediatrie')}" title="${escapeHtml(ch.title)} (${durationText})">
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
          <span class="matrix-badge-num">#${idx + 1}</span>
          ${modTag}
        </div>
        <span class="matrix-badge-title">${escapeHtml(ch.title)}</span>
        <span class="matrix-badge-duration">${durationText}</span>
      </div>
    `;
  }

  let html = '';
  if (filterMod === 'all') {
    html = `
      <div class="matrix-module-group">
        <div class="matrix-group-title">
          <span class="session-module-pill mod-pedia">Pédiatrie</span>
          <span>Programme Pédiatrie (${pediaChs.length} cours)</span>
        </div>
        <div class="matrix-group-badges">
          ${pediaChs.map((ch, idx) => renderChapterBadge(ch, idx)).join('')}
        </div>
      </div>
      <div class="matrix-module-group" style="margin-top:14px;">
        <div class="matrix-group-title">
          <span class="session-module-pill mod-psy">Psychiatrie</span>
          <span>Programme Psychiatrie (${psyChs.length} cours)</span>
        </div>
        <div class="matrix-group-badges">
          ${psyChs.map((ch, idx) => renderChapterBadge(ch, idx)).join('')}
        </div>
      </div>
    `;
  } else {
    html = `<div class="matrix-group-badges">${displayChapters.map((ch, idx) => renderChapterBadge(ch, idx)).join('')}</div>`;
  }

  container.innerHTML = html;

  container.querySelectorAll('.chapter-matrix-badge').forEach(badge => {
    badge.onclick = () => {
      const chTitle = badge.dataset.chapterTitle;
      const chId = badge.dataset.chapterId;
      const chMod = badge.dataset.chapterModule;
      currentLessonSelected.name = chTitle;
      currentLessonSelected.chapterId = chId;
      currentLessonSelected.moduleId = chMod;
      const searchInput = document.getElementById('lesson-search-input');
      if (searchInput) searchInput.value = chTitle;
      const activeNameEl = document.getElementById('active-lesson-name');
      if (activeNameEl) activeNameEl.textContent = chTitle;
      const timerCard = document.querySelector('.lesson-timer-card');
      if (timerCard) timerCard.scrollIntoView({ behavior: 'auto', block: 'center' });
    };
  });
}

export function initLessonTracker() {
  if (!lessonTracker) return;

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

export function renderLessonTrackerUI() {
  if (!lessonTracker) return;

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

  const activeMod = getActiveModule();
  const modTitle = activeMod ? activeMod.title : 'Pédiatrie';
  const chCount = (appState.allChapters && appState.allChapters.length > 0) ? appState.allChapters.length : 0;

  const dropHeader = document.getElementById('lesson-dropdown-header');
  if (dropHeader) dropHeader.textContent = `Chapitres (${chCount}) — ${modTitle} :`;

  const manualDropHeader = document.getElementById('manual-dropdown-header');
  if (manualDropHeader) manualDropHeader.textContent = `Chapitres (${chCount}) — ${modTitle} :`;

  const manualFieldLabel = document.getElementById('manual-lesson-field-label');
  if (manualFieldLabel) manualFieldLabel.textContent = `Cours / Leçon (${modTitle}) :`;

  const summaryContainer = document.getElementById('lesson-summary-table-container');
  const summaries = lessonTracker.getLessonSummaries(lessonSummaryModuleFilter);
  if (countBadge) {
    const sumMeta = getModuleDisplayMeta(lessonSummaryModuleFilter);
    countBadge.textContent = `${summaries.length} leçon${summaries.length > 1 ? 's' : ''} enregistrée${summaries.length > 1 ? 's' : ''} (${sumMeta.title})`;
  }

  if (summaryContainer) {
    if (summaries.length === 0) {
      const modMsg = lessonSummaryModuleFilter === 'all' ? '' : ` pour le module ${getModuleDisplayMeta(lessonSummaryModuleFilter).title}`;
      summaryContainer.innerHTML = `
        <div class="stats-empty-state" style="padding: 24px 16px;">
          <i data-lucide="clock"></i>
          <div>
            <div style="font-weight:700;color:#ffffff;margin-bottom:4px;">Aucune leçon chronométrée${escapeHtml(modMsg)}</div>
            <div style="font-size:0.8rem;color:var(--text-muted);">Choisissez un cours ci-dessus et cliquez sur <strong>Démarrer</strong> pour lancer votre premier chronomètre !</div>
          </div>
        </div>
      `;
    } else {
      const maxDuration = Math.max(...summaries.map(s => s.totalDurationSeconds || 0), 1);
      const isAll = (lessonSummaryModuleFilter === 'all');
      let tableHtml = `
        <table class="lesson-summary-table">
          <thead>
            <tr>
              <th>Leçon / Cours</th>
              ${isAll ? '<th>Module</th>' : ''}
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
        const modMeta = getModuleDisplayMeta(s.moduleId);
        const modPill = `<span class="session-module-pill ${modMeta.pillClass}">${escapeHtml(s.moduleTitle || modMeta.title)}</span>`;

        tableHtml += `
          <tr>
            <td>
              <span class="table-lesson-name">
                <i data-lucide="book-open" style="width:14px;height:14px;color:var(--cyan);flex-shrink:0;"></i>
                <span>${escapeHtml(s.lessonName)}</span>
              </span>
            </td>
            ${isAll ? `<td>${modPill}</td>` : ''}
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

      tableHtml += '</tbody></table>';
      summaryContainer.innerHTML = tableHtml;
    }
  }

  const sessionsContainer = document.getElementById('lesson-sessions-list');
  const recentSessions = lessonTracker.getSessions(lessonRecentModuleFilter).slice(0, 15);

  if (sessionsContainer) {
    if (recentSessions.length === 0) {
      const modMsg = lessonRecentModuleFilter === 'all' ? '' : ` pour le module ${getModuleDisplayMeta(lessonRecentModuleFilter).title}`;
      sessionsContainer.innerHTML = `
        <div style="text-align:center;padding:16px;color:var(--text-dim);font-size:0.8rem;">
          Aucune session enregistrée${escapeHtml(modMsg)}. L'historique des sessions apparaîtra ici après votre premier chronométrage.
        </div>
      `;
    } else {
      let sessionsHtml = '';
      recentSessions.forEach(sess => {
        const dateFormatted = sess.dateStr ? formatDateFr(sess.dateStr) : '';
        const timeObj = sess.endTime ? new Date(sess.endTime) : null;
        const timeStr = timeObj ? timeObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
        const sessModId = sess.moduleId || identifySessionModule(sess);
        const modMeta = getModuleDisplayMeta(sessModId);

        sessionsHtml += `
          <div class="lesson-session-row">
            <div class="session-left-meta">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span class="session-module-pill ${modMeta.pillClass}">${escapeHtml(modMeta.title)}</span>
                <span class="session-lesson-title">${escapeHtml(sess.lessonName)}</span>
              </div>
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

      sessionsContainer.querySelectorAll('.btn-delete-session').forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const sessId = btn.dataset.sessionId;
          const ok = await showConfirmModal({
            title: 'Supprimer la session ?',
            message: 'Voulez-vous supprimer cette session de travail ?',
            confirmLabel: 'Supprimer',
            isDanger: true
          });
          if (ok) {
            lessonTracker.deleteSession(sessId);
            renderLessonTrackerUI();
            appState.firebaseSyncService?.triggerAutoPush(true);
            showAppToast('🗑️ Session supprimée.');
          }
        };
      });
    }
  }

  document.querySelectorAll('#lesson-dist-module-filter .course-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mod === lessonDistModuleFilter);
  });
  document.querySelectorAll('#lesson-matrix-module-filter .course-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mod === lessonMatrixModuleFilter);
  });
  document.querySelectorAll('#lesson-summary-module-filter .course-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mod === lessonSummaryModuleFilter);
  });
  document.querySelectorAll('#lesson-recent-module-filter .course-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mod === lessonRecentModuleFilter);
  });

  const rangeToggleEl = document.getElementById('stats-lesson-range-toggle');
  if (rangeToggleEl) {
    rangeToggleEl.querySelectorAll('.range-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.range === currentLessonStatsRange);
    });
  }

  const dayTextEl = document.getElementById('lesson-range-day-text');
  if (dayTextEl) {
    dayTextEl.textContent = (currentLessonStatsRange === 'today') ? getDayLabelForOffset(selectedLessonDayOffset) : "Aujourd'hui";
  }
  const nextDayBtn = document.getElementById('btn-stats-lesson-next-day');
  if (nextDayBtn) {
    nextDayBtn.disabled = (selectedLessonDayOffset >= 0);
  }

  renderLessonAnalytics(currentLessonStatsRange);
  updateLessonTimerTick();
  refreshLucide();
}

function bindModuleFilterPills(selector, onSelect) {
  const pills = document.querySelectorAll(selector);
  pills.forEach(btn => {
    btn.onclick = () => {
      pills.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onSelect(btn.dataset.mod || 'all');
      refreshLucide();
    };
  });
}

function setupLessonTrackerEventListeners() {
  const searchInput = document.getElementById('lesson-search-input');
  const clearBtn = document.getElementById('btn-clear-lesson-input');
  const dropdown = document.getElementById('lesson-dropdown');
  const dropdownItems = document.getElementById('lesson-dropdown-items');

  function renderDropdown(filterText = '') {
    if (!dropdown || !dropdownItems) return;
    const cleanFilter = (filterText || '').trim().toLowerCase();
    const matches = appState.allChapters.filter(ch => {
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

    if (cleanFilter.length > 0 || !itemsHtml) {
      const trimmed = (filterText || '').trim();
      if (trimmed) {
        itemsHtml = `
          <div class="lesson-dropdown-item custom-choice" data-chapter-id="" data-chapter-title="${escapeHtml(trimmed)}">
            <span>✏️ Utiliser « <strong>${escapeHtml(trimmed)}</strong> »</span>
            <span class="item-badge">Nom libre</span>
          </div>
        ` + itemsHtml;
      }
    }

    dropdownItems.innerHTML = itemsHtml;
    dropdown.style.display = itemsHtml ? 'flex' : 'none';

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

  if (!isLessonOutsideClickBound) {
    isLessonOutsideClickBound = true;
    document.addEventListener('click', (e) => {
      const dd = document.getElementById('lesson-dropdown');
      const si = document.getElementById('lesson-search-input');
      if (dd && si && !dd.contains(e.target) && e.target !== si) {
        dd.style.display = 'none';
      }
    });
  }

  const offsetPills = document.querySelectorAll('#lesson-offset-pills .offset-pill');
  offsetPills.forEach(pill => {
    pill.onclick = () => {
      offsetPills.forEach(p => p.classList.remove('active'));
      const btnCustom = document.getElementById('btn-custom-offset');
      if (btnCustom) btnCustom.classList.remove('active');
      const customWrap = document.getElementById('custom-offset-input-wrap');
      if (customWrap) customWrap.style.display = 'none';

      pill.classList.add('active');
      currentLessonOffsetSeconds = parseInt(pill.dataset.offset, 10) || 0;
      updateLessonTimerTick();
    };
  });

  const btnCustomOffset = document.getElementById('btn-custom-offset');
  const customOffsetWrap = document.getElementById('custom-offset-input-wrap');
  if (btnCustomOffset && customOffsetWrap) {
    btnCustomOffset.onclick = () => {
      const isVisible = customOffsetWrap.style.display === 'flex';
      customOffsetWrap.style.display = isVisible ? 'none' : 'flex';
      if (!isVisible) {
        offsetPills.forEach(p => p.classList.remove('active'));
        btnCustomOffset.classList.add('active');
      }
    };
  }

  const btnApplyOffset = document.getElementById('btn-offset-apply');
  if (btnApplyOffset) {
    btnApplyOffset.onclick = () => {
      const hrs = parseInt(document.getElementById('custom-offset-hours')?.value, 10) || 0;
      const mins = parseInt(document.getElementById('custom-offset-mins')?.value, 10) || 0;
      currentLessonOffsetSeconds = Math.max(0, (hrs * 3600) + (mins * 60));
      updateLessonTimerTick();
    };
  }

  const lessonRangeToggle = document.getElementById('stats-lesson-range-toggle');
  const lessonCustomPicker = document.getElementById('custom-lesson-range-picker');
  const lessonCustomStartInput = document.getElementById('custom-lesson-date-start');
  const lessonCustomEndInput = document.getElementById('custom-lesson-date-end');
  const btnLessonApplyCustom = document.getElementById('btn-apply-custom-lesson-range');

  const btnLessonPrevDay = document.getElementById('btn-stats-lesson-prev-day');
  if (btnLessonPrevDay) {
    btnLessonPrevDay.onclick = (e) => {
      e.stopPropagation();
      selectedLessonDayOffset--;
      currentLessonStatsRange = 'today';
      lessonRangeToggle?.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('btn-lesson-range-day')?.classList.add('active');
      if (lessonCustomPicker) lessonCustomPicker.style.display = 'none';
      renderLessonTrackerUI();
      refreshLucide();
    };
  }

  const btnLessonNextDay = document.getElementById('btn-stats-lesson-next-day');
  if (btnLessonNextDay) {
    btnLessonNextDay.onclick = (e) => {
      e.stopPropagation();
      if (selectedLessonDayOffset < 0) {
        selectedLessonDayOffset++;
        currentLessonStatsRange = 'today';
        lessonRangeToggle?.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('btn-lesson-range-day')?.classList.add('active');
        if (lessonCustomPicker) lessonCustomPicker.style.display = 'none';
        renderLessonTrackerUI();
        refreshLucide();
      }
    };
  }

  if (lessonRangeToggle) {
    lessonRangeToggle.querySelectorAll('.range-btn').forEach(btn => {
      btn.onclick = () => {
        lessonRangeToggle.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const r = btn.dataset.range || 'today';

        if (r === 'today') {
          if (currentLessonStatsRange === 'today' && selectedLessonDayOffset !== 0) {
            selectedLessonDayOffset = 0;
          }
          currentLessonStatsRange = 'today';
        } else {
          selectedLessonDayOffset = 0;
          currentLessonStatsRange = r;
        }

        if (r === 'custom') {
          if (lessonCustomPicker) {
            lessonCustomPicker.style.display = 'flex';
            const today = lessonTracker.getTodayDateStr();
            if (lessonCustomEndInput && !lessonCustomEndInput.value) lessonCustomEndInput.value = today;
            if (lessonCustomStartInput && !lessonCustomStartInput.value) {
              lessonCustomStartInput.value = getDateStrWithOffset(-7);
            }
            customLessonStatsStart = lessonCustomStartInput?.value || today;
            customLessonStatsEnd = lessonCustomEndInput?.value || today;
            renderLessonTrackerUI();
          }
        } else {
          if (lessonCustomPicker) lessonCustomPicker.style.display = 'none';
          renderLessonTrackerUI();
        }
        refreshLucide();
      };
    });
  }

  ['box-custom-lesson-date-start', 'box-custom-lesson-date-end'].forEach(boxId => {
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

  if (btnLessonApplyCustom) {
    btnLessonApplyCustom.onclick = () => {
      customLessonStatsStart = lessonCustomStartInput?.value || '';
      customLessonStatsEnd = lessonCustomEndInput?.value || '';
      if (!customLessonStatsStart || !customLessonStatsEnd) {
        showAppToast('Veuillez sélectionner une date de début et une date de fin.', { type: 'warning' });
        return;
      }
      renderLessonTrackerUI();
      refreshLucide();
    };
  }

  const btnOpenManual = document.getElementById('btn-open-manual-session');
  const modalManual = document.getElementById('modal-manual-lesson-session');
  const btnCloseManual = document.getElementById('btn-close-manual-session-modal');
  const btnCancelManual = document.getElementById('btn-cancel-manual-session');
  const btnSaveManual = document.getElementById('btn-save-manual-session');
  const manualDateInput = document.getElementById('manual-session-date');
  const manualLessonInput = document.getElementById('manual-lesson-input');
  const manualClearBtn = document.getElementById('btn-clear-manual-input');
  const manualDropdown = document.getElementById('manual-lesson-dropdown');
  const manualDropdownItems = document.getElementById('manual-dropdown-items');

  function openManualSessionModal() {
    if (!modalManual) return;
    if (manualDateInput) manualDateInput.value = lessonTracker.getTodayDateStr();
    if (manualLessonInput) {
      manualLessonInput.value = currentLessonSelected.name || '';
      if (manualClearBtn) manualClearBtn.style.display = manualLessonInput.value ? 'block' : 'none';
    }
    modalManual.style.display = 'flex';
    refreshLucide(modalManual);
  }

  function closeManualSessionModal() {
    if (!modalManual) return;
    modalManual.style.display = 'none';
    if (manualDropdown) manualDropdown.style.display = 'none';
  }

  if (btnOpenManual) btnOpenManual.onclick = openManualSessionModal;
  if (btnCloseManual) btnCloseManual.onclick = closeManualSessionModal;
  if (btnCancelManual) btnCancelManual.onclick = closeManualSessionModal;

  if (modalManual) {
    modalManual.onclick = (e) => {
      if (e.target === modalManual) closeManualSessionModal();
    };
  }

  const presetPills = document.querySelectorAll('#manual-presets-row .btn-preset-pill');
  presetPills.forEach(pill => {
    pill.onclick = () => {
      presetPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const hInput = document.getElementById('manual-duration-hours');
      const mInput = document.getElementById('manual-duration-minutes');
      if (hInput) hInput.value = pill.dataset.hours;
      if (mInput) mInput.value = pill.dataset.mins;
    };
  });

  if (manualLessonInput && manualDropdown && manualDropdownItems) {
    function renderManualDropdown(filter = '') {
      const clean = (filter || '').trim().toLowerCase();
      const matches = appState.allChapters.filter(ch => !clean || ch.title.toLowerCase().includes(clean));
      let itemsHtml = '';
      matches.slice(0, 15).forEach(ch => {
        itemsHtml += `
          <div class="lesson-dropdown-item manual-item" data-chapter-title="${escapeHtml(ch.title)}" data-chapter-id="${escapeHtml(ch.id)}">
            <span>${escapeHtml(ch.title)}</span>
          </div>
        `;
      });
      manualDropdownItems.innerHTML = itemsHtml;
      manualDropdown.style.display = matches.length > 0 ? 'flex' : 'none';

      manualDropdownItems.querySelectorAll('.manual-item').forEach(it => {
        it.onclick = (e) => {
          e.stopPropagation();
          manualLessonInput.value = it.dataset.chapterTitle;
          if (manualClearBtn) manualClearBtn.style.display = 'block';
          manualDropdown.style.display = 'none';
        };
      });
    }

    manualLessonInput.oninput = () => {
      const val = manualLessonInput.value;
      if (manualClearBtn) manualClearBtn.style.display = val ? 'block' : 'none';
      renderManualDropdown(val);
    };
    manualLessonInput.onfocus = () => renderManualDropdown(manualLessonInput.value);

    if (manualClearBtn) {
      manualClearBtn.onclick = () => {
        manualLessonInput.value = '';
        manualClearBtn.style.display = 'none';
        manualDropdown.style.display = 'none';
      };
    }
  }

  if (btnSaveManual) {
    btnSaveManual.onclick = () => {
      const lessonName = manualLessonInput?.value?.trim();
      if (!lessonName) {
        showAppToast('Veuillez renseigner le nom ou choisir une leçon.', { type: 'warning' });
        if (manualLessonInput) manualLessonInput.focus();
        return;
      }

      const hrs = parseInt(document.getElementById('manual-duration-hours')?.value, 10) || 0;
      const mins = parseInt(document.getElementById('manual-duration-minutes')?.value, 10) || 0;
      const durationSeconds = (hrs * 3600) + (mins * 60);

      if (durationSeconds < 60) {
        showAppToast("Veuillez entrer une durée d'au moins 1 minute pour enregistrer la session.", { type: 'warning' });
        return;
      }

      const dateStr = manualDateInput?.value || lessonTracker.getTodayDateStr();
      const matchedCh = appState.allChapters.find(c => c.title.toLowerCase() === lessonName.toLowerCase());

      const session = lessonTracker.addManualSession({
        lessonName,
        chapterId: matchedCh ? matchedCh.id : null,
        moduleId: matchedCh ? (matchedCh.moduleId || getActiveModuleId()) : getActiveModuleId(),
        durationSeconds,
        dateStr
      });

      if (session) {
        closeManualSessionModal();
        renderLessonTrackerUI();
        updateLessonTimerTick();
        appState.firebaseSyncService?.triggerAutoPush(true);
        showAppToast(`✅ Session de cours enregistrée : ${formatDuration(durationSeconds)} sur « ${lessonName} » !`, { type: 'success' });
      }
    };
  }

  const btnStart = document.getElementById('btn-timer-start');
  if (btnStart) {
    btnStart.onclick = () => {
      const name = currentLessonSelected.name || searchInput?.value?.trim();
      if (!name) {
        showAppToast("Veuillez sélectionner ou taper le nom d'une leçon avant de démarrer le chronomètre.", { type: 'warning' });
        if (searchInput) searchInput.focus();
        return;
      }
      currentLessonSelected.name = name;
      lessonTracker.startTimer(
        currentLessonSelected.name,
        currentLessonSelected.chapterId,
        currentLessonOffsetSeconds,
        currentLessonSelected.moduleId || getActiveModuleId()
      );

      currentLessonOffsetSeconds = 0;
      const pills = document.querySelectorAll('#lesson-offset-pills .offset-pill');
      pills.forEach((p, idx) => p.classList.toggle('active', idx === 0));
      const customWrap = document.getElementById('custom-offset-input-wrap');
      if (customWrap) customWrap.style.display = 'none';

      renderLessonTrackerUI();
      updateLessonTimerTick();
      appState.firebaseSyncService?.triggerAutoPush(true);
    };
  }

  const btnPause = document.getElementById('btn-timer-pause');
  if (btnPause) {
    btnPause.onclick = () => {
      lessonTracker.pauseTimer();
      renderLessonTrackerUI();
      updateLessonTimerTick();
      appState.firebaseSyncService?.triggerAutoPush(true);
    };
  }

  const btnResume = document.getElementById('btn-timer-resume');
  if (btnResume) {
    btnResume.onclick = () => {
      lessonTracker.resumeTimer();
      renderLessonTrackerUI();
      updateLessonTimerTick();
      appState.firebaseSyncService?.triggerAutoPush(true);
    };
  }

  const btnStop = document.getElementById('btn-timer-stop');
  if (btnStop) {
    btnStop.onclick = () => {
      const session = lessonTracker.stopAndSaveSession();
      if (session) {
        renderLessonTrackerUI();
        updateLessonTimerTick();
        appState.firebaseSyncService?.triggerAutoPush(true);
        showAppToast(`✅ Session enregistrée : ${formatDuration(session.durationSeconds)} !`, { type: 'success' });
      } else {
        showAppToast('Session trop courte (moins de 1 seconde) : non enregistrée.', { type: 'warning' });
        renderLessonTrackerUI();
        updateLessonTimerTick();
      }
    };
  }

  const btnCancel = document.getElementById('btn-timer-cancel');
  if (btnCancel) {
    btnCancel.onclick = async () => {
      const ok = await showConfirmModal({
        title: 'Annuler le chronomètre ?',
        message: 'Voulez-vous vraiment annuler ce chronomètre sans enregistrer le temps ?',
        confirmLabel: 'Annuler le chrono',
        isDanger: true
      });
      if (ok) {
        lessonTracker.cancelTimer();
        renderLessonTrackerUI();
        updateLessonTimerTick();
        appState.firebaseSyncService?.triggerAutoPush(true);
      }
    };
  }

  bindModuleFilterPills('#lesson-dist-module-filter .course-pill-btn', (mod) => {
    lessonDistModuleFilter = mod;
    renderLessonDistribution(lessonDistModuleFilter);
  });

  bindModuleFilterPills('#lesson-matrix-module-filter .course-pill-btn', (mod) => {
    lessonMatrixModuleFilter = mod;
    renderLessonChaptersMatrix(lessonMatrixModuleFilter);
  });

  bindModuleFilterPills('#lesson-summary-module-filter .course-pill-btn', (mod) => {
    lessonSummaryModuleFilter = mod;
    renderLessonTrackerUI();
  });

  bindModuleFilterPills('#lesson-recent-module-filter .course-pill-btn', (mod) => {
    lessonRecentModuleFilter = mod;
    renderLessonTrackerUI();
  });

  const btnSubnavQcm = document.getElementById('btn-subnav-qcm');
  if (btnSubnavQcm) {
    btnSubnavQcm.onclick = () => switchStatsSubpage('qcm');
  }

  const btnSubnavLessons = document.getElementById('btn-subnav-lessons');
  if (btnSubnavLessons) {
    btnSubnavLessons.onclick = () => switchStatsSubpage('lessons');
  }

  const headerBadge = document.getElementById('active-lesson-header-badge');
  if (headerBadge) {
    headerBadge.onclick = () => {
      navigateToView('stats');
      switchStatsSubpage('lessons');
    };
  }
}
