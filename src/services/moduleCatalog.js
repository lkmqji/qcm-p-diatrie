// ============================================================
// Service de Catalogue des Modules et Gestion du Cursus Médical
// Cartographie intégrale des 6 années et 46 modules (Mystidia Exams)
// ============================================================

export const MEDICAL_YEARS = [
  {
    year: 1,
    id: "year_1",
    title: "1ère Année de Médecine (PCEM 1)",
    shortTitle: "1ère Année",
    cycle: "Cycle Pré-clinique Fondamental",
    modulesCount: 9,
    coursesCount: 99,
    qcmCount: 5189,
    modules: [
      { id: "anatomie_1", title: "Anatomie", courses: 22, qcm: 875, available: false },
      { id: "biochimie_1", title: "Biochimie", courses: 18, qcm: 1113, available: false },
      { id: "cytologie_1", title: "Cytologie", courses: 15, qcm: 915, available: false },
      { id: "physiologie_1", title: "Physiologie", courses: 12, qcm: 597, available: false },
      { id: "embryologie_1", title: "Embryologie", courses: 12, qcm: 574, available: false },
      { id: "histologie_1", title: "Histologie", courses: 10, qcm: 563, available: false },
      { id: "ssh_1", title: "Sciences Humaines & Sociales (SSH)", courses: 8, qcm: 477, available: false },
      { id: "chimie_1", title: "Chimie", courses: 1, qcm: 42, available: false },
      { id: "biophysique_1", title: "Biophysique", courses: 1, qcm: 33, available: false }
    ]
  },
  {
    year: 2,
    id: "year_2",
    title: "2ème Année de Médecine (PCEM 2)",
    shortTitle: "2ème Année",
    cycle: "Cycle Pré-clinique Intégré",
    modulesCount: 7,
    coursesCount: 186,
    qcmCount: 8272,
    modules: [
      { id: "neurosensorielle_2", title: "Unité Neurosensorielle", courses: 52, qcm: 2342, available: false },
      { id: "cardio_respi_2", title: "Unité Cardio-Respiratoire", courses: 37, qcm: 1762, available: false },
      { id: "endocrinienne_2", title: "Unité Endocrinienne", courses: 35, qcm: 1547, available: false },
      { id: "digestive_2", title: "Unité Digestive", courses: 19, qcm: 891, available: false },
      { id: "genetique_2", title: "Unité Génétique", courses: 19, qcm: 764, available: false },
      { id: "renale_2", title: "Unité Rénale", courses: 12, qcm: 477, available: false },
      { id: "immunologique_2", title: "Unité Immunologique", courses: 12, qcm: 489, available: false }
    ]
  },
  {
    year: 3,
    id: "year_3",
    title: "3ème Année de Médecine (DCEM 1)",
    shortTitle: "3ème Année",
    cycle: "Sémiologie & Paraclinique",
    modulesCount: 9,
    coursesCount: 243,
    qcmCount: 10364,
    modules: [
      { id: "semio_cardio_respi_3", title: "Sémiologie Cardio-Respiratoire & Psycho", courses: 48, qcm: 2245, available: false },
      { id: "microbiologie_3", title: "Microbiologie Médicale", courses: 31, qcm: 1319, available: false },
      { id: "parasitologie_3", title: "Parasitologie - Mycologie", courses: 29, qcm: 1202, available: false },
      { id: "pharmacologie_3", title: "Pharmacologie Clinique", courses: 28, qcm: 1129, available: false },
      { id: "acp_3", title: "Anatomie & Cytologie Pathologique (ACP)", courses: 24, qcm: 1027, available: false },
      { id: "semio_neuro_loco_3", title: "Sémiologie Neuro, Locomoteur & Cutané", courses: 23, qcm: 915, available: false },
      { id: "semio_endocrine_urinaire_3", title: "Sémiologie Endocrine, Repro & Urinaire", courses: 23, qcm: 897, available: false },
      { id: "semio_digestive_hemato_3", title: "Sémiologie Digestive & Hématopoïèse", courses: 22, qcm: 887, available: false },
      { id: "immunologie_3", title: "Immunologie Médicale", courses: 15, qcm: 743, available: false }
    ]
  },
  {
    year: 4,
    id: "year_4",
    title: "4ème Année de Médecine (DCEM 2)",
    shortTitle: "4ème Année",
    cycle: "Pathologie Médicale & Chirurgicale I",
    modulesCount: 6,
    coursesCount: 200,
    qcmCount: 9704,
    modules: [
      { id: "gastro_enterologie_4", title: "Gastro-Entérologie & Chirurgie Digestive", courses: 52, qcm: 2342, available: false },
      { id: "cardiologie_4", title: "Cardiologie & Chirurgie Vasculaire", courses: 33, qcm: 1733, available: false },
      { id: "infectieuses_4", title: "Maladies Infectieuses", courses: 32, qcm: 1614, available: false },
      { id: "neurologie_4", title: "Neurologie & Neurochirurgie", courses: 31, qcm: 1544, available: false },
      { id: "onco_hematologie_4", title: "Onco-Hématologie", courses: 27, qcm: 1294, available: false },
      { id: "pneumologie_4", title: "Pneumologie & Chirurgie Thoracique", courses: 25, qcm: 1177, available: false }
    ]
  },
  {
    year: 5,
    id: "year_5",
    title: "5ème Année de Médecine (DCEM 3)",
    shortTitle: "5ème Année",
    cycle: "Pathologie Médicale & Chirurgicale II",
    modulesCount: 6,
    coursesCount: 212,
    qcmCount: 9035,
    modules: [
      { id: "pediatrie", title: "Pédiatrie & Chirurgie Pédiatrique", courses: 35, qcm: 1905, available: true, active: true },
      { id: "locomoteur_5", title: "Appareil Locomoteur (Ortho & Rhumato)", courses: 47, qcm: 2089, available: false },
      { id: "gynecologie_5", title: "Gynécologie - Obstétrique", courses: 44, qcm: 1977, available: false },
      { id: "urologie_nephro_5", title: "Urologie & Néphrologie", courses: 42, qcm: 1789, available: false },
      { id: "endocrinologie_5", title: "Endocrinologie - Diabétologie", courses: 23, qcm: 915, available: false },
      { id: "psychiatrie_5", title: "Psychiatrie & Pédopsychiatrie", courses: 21, qcm: 702, available: false }
    ]
  },
  {
    year: 6,
    id: "year_6",
    title: "6ème Année de Médecine (DCEM 4)",
    shortTitle: "6ème Année",
    cycle: "Spécialités & Santé Publique",
    modulesCount: 9,
    coursesCount: 215,
    qcmCount: 6631,
    modules: [
      { id: "epidemiologie_6", title: "Épidémiologie & Économie de la Santé", courses: 34, qcm: 1143, available: false },
      { id: "orl_6", title: "ORL (Oto-Rhino-Laryngologie)", courses: 31, qcm: 978, available: false },
      { id: "travail_6", title: "Santé au Travail & Environnement", courses: 27, qcm: 867, available: false },
      { id: "geriatrie_6", title: "Gériatrie & Gérontologie", courses: 26, qcm: 742, available: false },
      { id: "umc_6", title: "UMC (Urgences Médico-Chirurgicales)", courses: 22, qcm: 689, available: false },
      { id: "systeme_6", title: "Maladies de Système & Médecine Interne", courses: 21, qcm: 615, available: false },
      { id: "legale_6", title: "Médecine Légale & Droit Médical", courses: 20, qcm: 642, available: false },
      { id: "ophtalmologie_6", title: "Ophtalmologie", courses: 17, qcm: 497, available: false },
      { id: "dermatologie_6", title: "Dermatologie - Vénérologie", courses: 17, qcm: 458, available: false }
    ]
  }
];

// Module actif courant (persistance LocalStorage)
const ACTIVE_MODULE_STORAGE_KEY = 'pediadrill_active_module_id';
const EXAM_DATE_STORAGE_PREFIX = 'pediadrill_exam_date_';

export function getActiveModuleId() {
  try {
    return localStorage.getItem(ACTIVE_MODULE_STORAGE_KEY) || 'pediatrie';
  } catch (e) {
    return 'pediatrie';
  }
}

export function setActiveModuleId(moduleId) {
  const mod = findModuleById(moduleId);
  if (!mod || !mod.available) {
    throw new Error(`Le module ${moduleId} n'est pas encore disponible.`);
  }
  try {
    localStorage.setItem(ACTIVE_MODULE_STORAGE_KEY, moduleId);
  } catch (e) {
    console.error('[moduleCatalog] Erreur de sauvegarde du module actif', e);
  }
  return mod;
}

export function findModuleById(moduleId) {
  for (const y of MEDICAL_YEARS) {
    for (const m of y.modules) {
      if (m.id === moduleId) {
        return { ...m, yearNumber: y.year, yearTitle: y.title, cycle: y.cycle };
      }
    }
  }
  return null;
}

export function getActiveModule() {
  const activeId = getActiveModuleId();
  return findModuleById(activeId) || findModuleById('pediatrie');
}

export function getAllYearsWithModules() {
  const activeId = getActiveModuleId();
  return MEDICAL_YEARS.map(y => ({
    ...y,
    modules: y.modules.map(m => ({
      ...m,
      isActive: m.id === activeId
    }))
  }));
}

// Gestion de la date d'examen
export function getExamDate(moduleId) {
  const targetId = moduleId || getActiveModuleId();
  try {
    return localStorage.getItem(EXAM_DATE_STORAGE_PREFIX + targetId) || '';
  } catch (e) {
    return '';
  }
}

export function setExamDate(dateStr, moduleId) {
  const targetId = moduleId || getActiveModuleId();
  try {
    if (!dateStr) {
      localStorage.removeItem(EXAM_DATE_STORAGE_PREFIX + targetId);
    } else {
      localStorage.setItem(EXAM_DATE_STORAGE_PREFIX + targetId, dateStr);
    }
  } catch (e) {
    console.error('[moduleCatalog] Erreur sauvegarde date examen', e);
  }
}

export function getExamCountdown(moduleId) {
  const dateStr = getExamDate(moduleId);
  if (!dateStr) {
    return {
      hasDate: false,
      dateString: '',
      daysRemaining: null,
      isToday: false,
      isExpired: false,
      statusLabel: 'Date non définie'
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parts = dateStr.split('-');
  const exam = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  exam.setHours(0, 0, 0, 0);

  const diffTime = exam.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const formattedDate = exam.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  if (diffDays === 0) {
    return {
      hasDate: true,
      dateString: dateStr,
      formattedDate,
      daysRemaining: 0,
      isToday: true,
      isExpired: false,
      statusLabel: "Jour J ! C'est le jour de l'examen"
    };
  } else if (diffDays < 0) {
    return {
      hasDate: true,
      dateString: dateStr,
      formattedDate,
      daysRemaining: Math.abs(diffDays),
      isToday: false,
      isExpired: true,
      statusLabel: `Examen passé il y a ${Math.abs(diffDays)} j`
    };
  } else {
    return {
      hasDate: true,
      dateString: dateStr,
      formattedDate,
      daysRemaining: diffDays,
      isToday: false,
      isExpired: false,
      statusLabel: `J-${diffDays}`
    };
  }
}

if (typeof window !== 'undefined') {
  window.ModuleCatalog = {
    MEDICAL_YEARS,
    getActiveModuleId,
    setActiveModuleId,
    findModuleById,
    getActiveModule,
    getAllYearsWithModules,
    getExamDate,
    setExamDate,
    getExamCountdown
  };
}
