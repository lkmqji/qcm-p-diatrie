// ============================================================================
// Utilitaires de Formatage Médical, Dates, Markdown & Debounce
// ============================================================================
import { cleanLatexMath } from '../services/gemini.js';

export function debounce(fn, delay = 200) {
  let timerId = null;
  return function debounced(...args) {
    if (timerId) clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = null;
      fn.apply(this, args);
    }, delay);
  };
}

export function formatNumber(num) {
  return new Intl.NumberFormat('fr-FR').format(num || 0);
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function parseMarkdownInline(text) {
  if (!text) return '';
  const clean = (typeof cleanLatexMath === 'function' ? cleanLatexMath(String(text)) : String(text))
    .replace(/\$SpO_2\$/gi, 'SpO₂')
    .replace(/\$SpO2\$/gi, 'SpO₂')
    .replace(/SpO_2/gi, 'SpO₂')
    .replace(/\$PaO_2\$/gi, 'PaO₂')
    .replace(/\$PaCO_2\$/gi, 'PaCO₂')
    .replace(/\$([^\$]+)\$/g, '$1');

  let res = escapeHtml(clean);
  res = res.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  res = res.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  res = res.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  res = res.replace(/(^|[^*])\*(?!\*)(.*?)(?<!\*)\*([^*]|$)/g, '$1<em>$2</em>$3');
  return res;
}

export function formatMedicalContent(raw) {
  if (!raw || typeof raw !== 'string') return '';

  let text = typeof cleanLatexMath === 'function' ? cleanLatexMath(raw) : raw.trim();
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
  text = text.replace(/([^\n\r])\s*([➢⁃•►▶✔✓])\s*/g, '$1\n$2 ');
  text = text.replace(/[\u00a0\s]{3,}([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ0-9<])/g, '\n- $1');
  text = text.replace(/([a-zàâäéèêëîïôöùûüç]{3,})([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][a-zàâäéèêëîïôöùûüç]{2,})/g, '$1.\n\n$2');
  text = text.replace(/([a-z0-9\)])\s*\.\s*([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ])/g, '$1. $2');
  text = text.replace(/([a-z0-9\)])\s*\.\s*(Amyotrophie|H[ée]patom[ée]galie|Distension|L[ée]sions|Biologie|An[ée]mie|Troubles?|Signes?|Phase|Aspect|Examens?|Culture|Ponction|Traitement|Diagnostic|Pronostic|Surveillance|Lutte|Am[ée]lioration|Inconv[ée]nient|Lorsque|Elle|Il|Les|La|Le|Des|En|Pour|Dans)\b/g, '$1.\n\n$2');
  text = text.replace(/(^|[^\n\r])\s*([a-eA-E])\s*[-–/:]\s*(?:-?\s*)?(Vrai|Faux|VRAI|FAUX|Fausse|Juste|Perplexe)\b/gi, '$1\n- **$2) $3** : ');
  text = text.replace(/(^|[^\n\r])\s*(\d+)\s*[-–/:]\s*(?:-?\s*)?(Vrai|Faux|VRAI|FAUX|Fausse|Juste|Perplexe)\b/gi, '$1\n- **Item $2 ($3)** : ');

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

  text = text.replace(/([^\n\r])\s*(Source\s+diapositive|Source\s*[:;])/gi, '$1\n\n$2');
  text = text.replace(/^[-•*➢⁃►▶✔✓]\s*(\d+[\.\)-]\s+)/gm, '$1');
  text = text.replace(/([^\n\r\-•*➢⁃►▶✔✓])\s+(\d+[\.\)-]\s+[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ])/g, '$1\n$2');
  text = text.replace(/([^\n\r\-•*➢⁃►▶✔✓])\s+([a-eA-E][\.\)]\s+[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ])/g, '$1\n$2');
  text = text.replace(/\n{3,}/g, '\n\n');

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let html = '<div class="medical-formatted-content">';
  let inBulletList = false;
  let inNumList = false;

  const closeLists = () => {
    if (inBulletList) { html += '</ul>'; inBulletList = false; }
    if (inNumList) { html += '</ul>'; inNumList = false; }
  };

  lines.forEach(line => {
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

    const bulletMatch = line.match(/^([➢⁃•►▶✔✓\*\-]\s*)(.*)$/);
    if (bulletMatch) {
      if (inNumList) { html += '</ul>'; inNumList = false; }
      if (!inBulletList) { html += '<ul class="medical-bullet-list">'; inBulletList = true; }
      const bulletChar = bulletMatch[1].trim() || '•';
      const content = bulletMatch[2].trim();
      html += `<li class="medical-bullet-item"><span class="medical-bullet-icon">${escapeHtml(bulletChar)}</span><div class="medical-bullet-text">${parseMarkdownInline(content)}</div></li>`;
      return;
    }

    const numMatch = line.match(/^(\d+)(?:[-–\.]|\))\s+(.*)$/);
    if (numMatch) {
      if (inBulletList) { html += '</ul>'; inBulletList = false; }
      if (!inNumList) { html += '<ul class="medical-num-list">'; inNumList = true; }
      const num = numMatch[1];
      const content = numMatch[2].trim();
      html += `<li class="medical-num-item"><span class="medical-num-badge">${escapeHtml(num)}</span><div class="medical-num-text">${parseMarkdownInline(content)}</div></li>`;
      return;
    }

    closeLists();
    html += `<p class="medical-paragraph">${parseMarkdownInline(line)}</p>`;
  });

  closeLists();
  html += '</div>';
  return html;
}

if (typeof window !== 'undefined') {
  window.cleanLatexMath = cleanLatexMath;
  window.formatMedicalContent = formatMedicalContent;
}

export function formatReasoningNote(noteText) {
  if (!noteText || typeof noteText !== 'string' || !noteText.trim()) {
    return '<div class="reasoning-cards-container"><div class="reasoning-card card-method"><div class="reasoning-card-body">Aucune note de raisonnement clinique disponible.</div></div></div>';
  }

  const raw = typeof cleanLatexMath === 'function' ? cleanLatexMath(noteText) : noteText.trim();

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
    const clean = contentRaw.trim()
      .replace(/^[\s\-–—*]{3,}\s*$/gm, '')
      .trim();

    const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
    let out = '';
    let inList = false;
    let inQuote = false;

    lines.forEach(line => {
      if (/^[\-–—*]{3,}$/.test(line)) return;

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

  return `<div class="reasoning-cards-container"><div class="reasoning-card card-method"><div class="reasoning-card-body">${renderSectionContent(raw)}</div></div></div>`;
}

export function formatCroqAnswer(answerText) {
  if (!answerText || typeof answerText !== 'string' || !answerText.trim()) {
    return '<div class="empty-answer">Non renseignée</div>';
  }

  const trimmed = answerText.trim();
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

export function extractQuestionDateOrSession(q) {
  if (!q) return '';
  let rawDate = '';

  if (q.session && typeof q.session === 'string' && q.session.trim()) rawDate = q.session.trim();
  else if (q.session_type && (q.year || q.annee)) rawDate = String(q.session_type).trim() + ' ' + String(q.year || q.annee).trim();
  else if (q.date && typeof q.date === 'string' && q.date.trim()) rawDate = q.date.trim();
  else if (q.source_date && typeof q.source_date === 'string') rawDate = q.source_date.trim();
  else if (q.year && (typeof q.year === 'string' || typeof q.year === 'number')) rawDate = String(q.year).trim();

  if (!rawDate) {
    const texts = [q.explanation || '', q.clinical_case || '', q.question || ''];
    const full = texts.join(' \n ');

    const resMatch = full.match(/\b(R[ée]sidanat(?:\s+[A-Za-z]+)?\s*[-_:/]?\s*(?:20\d\d|19\d\d|\b[0-2]\d\b))\b/i);
    if (resMatch) {
      rawDate = resMatch[1].trim();
    } else {
      const ratMatch = full.match(/\b(Rat(?:t)?rapage\s*[-_:/]?\s*(?:20\d\d|19\d\d|\b[0-2]\d\b)|\bR\s*[-_:/]?\s*(?:20\d\d))\b/i);
      if (ratMatch) {
        rawDate = ratMatch[1].trim();
      } else {
        const pMatch = full.match(/\b(Principale\s*[-_:/]?\s*(?:20\d\d|19\d\d|\b[0-2]\d\b)|\bP\s*[12]?\s*[-_:/]?\s*(?:20\d\d))\b/i);
        if (pMatch) {
          rawDate = pMatch[1].trim();
        } else {
          const emdMatch = full.match(/\b(EMD\s*[123]?\s*[-_:/]?\s*(?:20\d\d|19\d\d|\b[0-2]\d\b)|Session\s*[-_:/]?\s*(?:20\d\d|19\d\d))\b/i);
          if (emdMatch) {
            rawDate = emdMatch[1].trim();
          } else {
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

  let m = rawDate.match(/r[ée]sidanat(?:\s+([a-z]+))?\s*[-_/:]?\s*('?(?:20\d\d|19\d\d|[0-2]\d))\b/i);
  if (m) {
    let year = m[2].replace("'", '');
    if (year.length === 2) year = (parseInt(year, 10) > 50 ? '19' : '20') + year;
    const city = m[1] ? (' ' + m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()) : '';
    return 'Résidanat' + city + ' ' + year;
  }

  m = rawDate.match(/(?:rat(?:t)?rapage|(?:\bR))\s*([12])?\s*[-_/:]?\s*('?(?:20\d\d|19\d\d|[0-2]\d))\b/i);
  if (m) {
    let year = m[2].replace("'", '');
    if (year.length === 2) year = (parseInt(year, 10) > 50 ? '19' : '20') + year;
    return 'Rattrapage ' + year;
  }

  m = rawDate.match(/(?:principale|(?:\bP))\s*([12])?\s*[-_/:]?\s*('?(?:20\d\d|19\d\d|[0-2]\d))\b/i);
  if (m) {
    const pNum = m[1] ? m[1] : '';
    let year = m[2].replace("'", '');
    if (year.length === 2) year = (parseInt(year, 10) > 50 ? '19' : '20') + year;
    return 'P' + (pNum ? pNum + ' ' : ' ') + year;
  }

  m = rawDate.match(/emd\s*([123])?\s*[-_/:]?\s*('?(?:20\d\d|19\d\d|[0-2]\d))\b/i);
  if (m) {
    const emdNum = m[1] ? m[1] : '';
    let year = m[2].replace("'", '');
    if (year.length === 2) year = (parseInt(year, 10) > 50 ? '19' : '20') + year;
    return 'EMD' + (emdNum ? emdNum + ' ' : ' ') + year;
  }

  return rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
}

export function getDateStrWithOffset(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getDayLabelForOffset(offsetDays = 0) {
  if (offsetDays === 0) return "Aujourd'hui";
  if (offsetDays === -1) return "Hier";
  if (offsetDays === -2) return "Avant-hier";
  const dateStr = getDateStrWithOffset(offsetDays);
  return formatDateFr(dateStr);
}

export function formatDuration(totalSeconds) {
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

export function formatDateFr(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const options = { weekday: 'short', day: 'numeric', month: 'short' };
  return d.toLocaleDateString('fr-FR', options);
}

export function formatDigitalClockTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(s)}`;
}
