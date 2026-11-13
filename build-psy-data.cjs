// ============================================================
// Script de Normalisation des QCM de Psychiatrie
// Convertit qcm-psy/*.json -> src/data/psy_chapters.* & psy_questions.*
// ============================================================

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'qcm-psy');
const dataDir = path.join(__dirname, 'src', 'data');

if (!fs.existsSync(srcDir)) {
  console.error('[psy-builder] Dossier qcm-psy introuvable !');
  process.exit(1);
}

const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.json')).sort();
console.log(`[psy-builder] Traitement de ${files.length} fichiers de cours de psychiatrie...`);

const chapters = [];
const allQuestions = [];

files.forEach(f => {
  const filePath = path.join(srcDir, f);
  const raw = fs.readFileSync(filePath, 'utf8');
  const content = JSON.parse(raw);

  const chapterId = f.replace('.json', '');
  const chapterTitle = (content.course && content.course.title) 
    ? content.course.title.trim() 
    : chapterId.replace(/_/g, ' ');

  const rawQuestions = content.questions || [];
  let croqCount = 0;

  const normalizedQuestions = rawQuestions.map((q, idx) => {
    const isCroq = !!q.is_croq;
    if (isCroq) croqCount++;

    const options = (q.options || []).map(opt => ({
      id: opt.id || (idx * 10 + 1),
      letter: opt.letter || '',
      text: opt.text ? opt.text.trim() : '',
      is_correct: !!opt.is_correct
    }));

    const correctCount = options.filter(o => o.is_correct).length;
    let qType = 'QCU';
    if (isCroq) {
      qType = 'QROC';
    } else if (correctCount > 1) {
      qType = 'QCM';
    } else if (q.metadata && q.metadata.type) {
      qType = q.metadata.type;
    }

    const questionText = (q.question || q.statement || '').trim();
    let explanationText = (q.explanation || '').trim();
    if (!explanationText && q.explanation_html) {
      explanationText = q.explanation_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    return {
      uid: `psy_${chapterId}_${q.id || (idx + 1)}`,
      chapterId: chapterId,
      chapterTitle: chapterTitle,
      id: q.id || (idx + 1),
      type: qType,
      is_croq: isCroq,
      is_cas_clinique: !!q.is_cas_clinique,
      clinical_case: q.clinical_case || null,
      question: questionText,
      options: options,
      croq_answer: q.croq_answer || '',
      explanation: explanationText,
      media_urls: q.media_urls || []
    };
  });

  chapters.push({
    id: chapterId,
    title: chapterTitle,
    count: normalizedQuestions.length,
    croqCount: croqCount
  });

  allQuestions.push(...normalizedQuestions);
});

console.log(`[psy-builder] Compilé : ${chapters.length} chapitres, ${allQuestions.length} questions.`);

// 1. Sauvegarde psy_chapters
const chaptersJsonPath = path.join(dataDir, 'psy_chapters.json');
fs.writeFileSync(chaptersJsonPath, JSON.stringify(chapters, null, 2), 'utf8');

const chaptersJsPath = path.join(dataDir, 'psy_chapters.js');
fs.writeFileSync(chaptersJsPath, `window.PSY_CHAPTERS = ${JSON.stringify(chapters, null, 2)};\n`, 'utf8');

// 2. Sauvegarde psy_questions
const questionsJsonPath = path.join(dataDir, 'psy_questions.json');
fs.writeFileSync(questionsJsonPath, JSON.stringify(allQuestions, null, 2), 'utf8');

const questionsJsPath = path.join(dataDir, 'psy_questions.js');
fs.writeFileSync(questionsJsPath, `window.PSY_QUESTIONS = ${JSON.stringify(allQuestions)};\n`, 'utf8');

console.log('[psy-builder] Fichiers générés avec succès dans src/data/ !');
