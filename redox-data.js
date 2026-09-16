// Educational half-reactions: strongly alkaline conditions are explicit.
export const LEVELS = {
  beginner: "Бастапқы",
  intermediate: "Орта",
  advanced: "Жоғары",
};
export const QUESTIONS = [
  {
    id: "acid",
    level: "beginner",
    prompt: "Қышқыл ортада MnO₄⁻ қандай бөлшекке дейін тотықсызданады?",
    options: ["Mn²⁺", "MnO₂", "MnO₄²⁻"],
    answer: 0,
    explanation:
      "Mn: +7 → +2. Бір марганец атомы 5 электрон қабылдайды. Күлгін түс жойылады; Mn²⁺ ерітіндісі өте әлсіз қызғылт.",
    equation: "MnO₄⁻ + 8H⁺ + 5e⁻ → Mn²⁺ + 4H₂O",
    tone: "acid",
  },
  {
    id: "neutral",
    level: "beginner",
    prompt: "Бейтарап ортадағы қоңыр тұнбаны анықтаңыз.",
    options: ["Mn²⁺", "MnO₂", "K₂SO₄"],
    answer: 1,
    explanation:
      "MnO₂ — марганец(IV) оксидінің қоңыр тұнбасы. Mn: +7 → +4, яғни 3 электрон қабылдайды.",
    equation: "MnO₄⁻ + 2H₂O + 3e⁻ → MnO₂↓ + 4OH⁻",
    tone: "neutral",
  },
  {
    id: "alkali",
    level: "beginner",
    prompt: "Күшті сілтілі ортада манганат түзілгенде қандай түс байқалады?",
    options: ["Түссіз", "Күлгін", "Жасыл"],
    answer: 2,
    explanation:
      "MnO₄²⁻ манганат-ионы жасыл. Mn: +7 → +6. Бұл модель күшті сілтілі ортаға арналған; өнім жағдайға тәуелді.",
    equation: "MnO₄⁻ + e⁻ → MnO₄²⁻",
    tone: "alkaline",
  },
  {
    id: "electrons",
    level: "intermediate",
    prompt: "Қышқыл ортада бір MnO₄⁻ ионы қанша электрон қабылдайды?",
    options: ["1", "3", "5"],
    answer: 2,
    explanation: "Тотығу дәрежесі +7-ден +2-ге төмендейді: 7 − 2 = 5 электрон.",
    equation: "MnO₄⁻ + 8H⁺ + 5e⁻ → Mn²⁺ + 4H₂O",
    tone: "acid",
  },
  {
    id: "iron",
    level: "intermediate",
    prompt: "Қышқыл ортада 1 моль MnO₄⁻ үшін неше моль Fe²⁺ қажет?",
    options: ["5", "2", "3"],
    answer: 0,
    explanation:
      "Әр Fe²⁺ бір электрон береді, ал MnO₄⁻ бес электрон қабылдайды. Сондықтан қатынас 5 : 1.",
    equation: "5Fe²⁺ + MnO₄⁻ + 8H⁺ → 5Fe³⁺ + Mn²⁺ + 4H₂O",
    tone: "acid",
  },
  {
    id: "oxidant",
    level: "intermediate",
    prompt: "Fe²⁺ пен перманганат реакциясында тотықтырғыш қайсы?",
    options: ["Fe²⁺", "MnO₄⁻", "H₂O"],
    answer: 1,
    explanation:
      "Тотықтырғыш электрон қабылдайды және өзі тотықсызданады. Бұл реакцияда ол — MnO₄⁻.",
    equation: "Fe²⁺ → Fe³⁺ + e⁻",
    tone: "acid",
  },
  {
    id: "sulfite",
    level: "advanced",
    prompt: "Бейтарап ортада SO₃²⁻ : MnO₄⁻ мольдік қатынасы қандай?",
    options: ["1 : 1", "3 : 2", "5 : 2"],
    answer: 1,
    explanation:
      "Сульфиттің күкірті +4 → +6: 2e⁻ береді. Mn +7 → +4: 3e⁻ қабылдайды. ЕКОЕ = 6, қатынас 3 : 2.",
    equation: "3SO₃²⁻ + 2MnO₄⁻ + H₂O → 3SO₄²⁻ + 2MnO₂↓ + 2OH⁻",
    tone: "neutral",
  },
  {
    id: "balance",
    level: "advanced",
    prompt: "Қышқыл ортада 2MnO₄⁻ пен 5SO₃²⁻ реакциясына қанша H⁺ қажет?",
    options: ["16", "8", "6"],
    answer: 2,
    explanation:
      "Заряд пен атомдар сақталуы үшін 6H⁺ және өнімде 3H₂O қажет. Екі жақтың толық заряды −6.",
    equation: "5SO₃²⁻ + 2MnO₄⁻ + 6H⁺ → 5SO₄²⁻ + 2Mn²⁺ + 3H₂O",
    tone: "acid",
  },
  {
    id: "strong",
    level: "advanced",
    prompt:
      "Күшті сілтілі ортада 1 моль SO₃²⁻ неше моль MnO₄⁻ ионымен әрекеттеседі?",
    options: ["2", "3", "5"],
    answer: 0,
    explanation:
      "SO₃²⁻ екі электрон береді, ал әр MnO₄⁻ бір электрон қабылдап MnO₄²⁻ түзеді. Сондықтан 2 моль керек.",
    equation: "SO₃²⁻ + 2MnO₄⁻ + 2OH⁻ → SO₄²⁻ + 2MnO₄²⁻ + H₂O",
    tone: "alkaline",
  },
];
export function questionsFor(level) {
  if (!LEVELS[level]) throw new Error("Белгісіз деңгей");
  return QUESTIONS.filter((q) => q.level === level);
}
export function grade(level, answers) {
  const qs = questionsFor(level);
  if (
    !Array.isArray(answers) ||
    answers.length !== qs.length ||
    answers.some((a) => !Number.isInteger(a) || a < 0 || a > 2)
  )
    throw new Error("Барлық тапсырманы аяқтаңыз");
  const correct = qs.filter((q, i) => q.answer === answers[i]).length;
  return {
    correct,
    total: qs.length,
    score: correct * 100,
    max_score: qs.length * 100,
  };
}
