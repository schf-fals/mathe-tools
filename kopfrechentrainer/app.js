const INITIAL_TIME = 100;
const STORAGE_KEY = 'kopfrechentrainer-records-v1';
const MODES = {
  noob: {
    label: 'Noob',
    maxFactor: 10,
    includeGaps: false,
    includeDivision: false,
    maxAddSub: 50,
    drainPerSecond: 2.6,
    rewardTime: 16,
    wrongPenalty: 1.5,
    scoreMultiplier: 1,
  },
  pro: {
    label: 'Pro',
    maxFactor: 15,
    includeGaps: true,
    includeDivision: true,
    maxAddSub: 100,
    drainPerSecond: 4.2,
    rewardTime: 12,
    wrongPenalty: 2.5,
    scoreMultiplier: 1.5,
  },
  hacker: {
    label: 'Hacker',
    maxFactor: 20,
    includeGaps: true,
    includeDivision: true,
    maxAddSub: 100,
    drainPerSecond: 6,
    rewardTime: 9,
    wrongPenalty: 4,
    scoreMultiplier: 2,
  },
};

const screens = {
  start: document.querySelector('#startScreen'),
  game: document.querySelector('#gameScreen'),
  end: document.querySelector('#endScreen'),
};

const modeButtons = document.querySelectorAll('[data-mode]');
const restartButton = document.querySelector('#restartButton');
const changeModeButton = document.querySelector('#changeModeButton');
const problemCard = document.querySelector('#problemCard');
const problemEl = document.querySelector('#problem');
const answerInput = document.querySelector('#answerInput');
const answerButton = document.querySelector('#answerButton');
const modeLabel = document.querySelector('#modeLabel');
const survivalTimeEl = document.querySelector('#survivalTime');
const scoreEl = document.querySelector('#score');
const streakEl = document.querySelector('#streak');
const timeFill = document.querySelector('#timeFill');
const finalScore = document.querySelector('#finalScore');
const finalModeEl = document.querySelector('#finalMode');
const finalTimeEl = document.querySelector('#finalTime');
const bestStreakEl = document.querySelector('#bestStreak');
const solvedCountEl = document.querySelector('#solvedCount');
const recordLine = document.querySelector('#recordLine');

let tasks = [];
let currentTask = null;
let timeLeft = INITIAL_TIME;
let score = 0;
let streak = 0;
let bestStreak = 0;
let solvedCount = 0;
let survivalSeconds = 0;
let lastFrame = 0;
let animationId = null;
let isPlaying = false;
let activeMode = 'noob';

function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.add('is-hidden'));
  screens[name].classList.remove('is-hidden');
}

function makeTask(id, text, answer) {
  return { id, text, answer: String(answer) };
}

function buildTasks(mode = activeMode) {
  const settings = MODES[mode];
  const pool = [];

  for (let a = 2; a <= settings.maxFactor; a += 1) {
    for (let b = 2; b <= settings.maxFactor; b += 1) {
      pool.push(makeTask(`mul:${a}:${b}`, `${a} · ${b} = ?`, a * b));
      if (settings.includeGaps) {
        pool.push(makeTask(`gap-mul-left:${a}:${b}`, `? · ${b} = ${a * b}`, a));
        pool.push(makeTask(`gap-mul-right:${a}:${b}`, `${a} · ? = ${a * b}`, b));
      }
      if (settings.includeDivision) {
        pool.push(makeTask(`div:${a}:${b}`, `${a * b} : ${a} = ?`, b));
      }
    }
  }

  for (let base = 10; base < settings.maxAddSub; base += 10) {
    for (let ones = 1; ones <= 9; ones += 1) {
      for (let add = 1; add <= 9; add += 1) {
        const first = base + ones;
        const result = first + add;
        if (Math.floor(first / 10) !== Math.floor(result / 10) && result <= settings.maxAddSub) {
          pool.push(makeTask(`add:${first}:${add}`, `${first} + ${add} = ?`, result));
          if (settings.includeGaps) {
            pool.push(makeTask(`gap-add:${first}:${add}`, `${first} + ? = ${result}`, add));
          }
        }
      }
    }
  }

  for (let result = 11; result < settings.maxAddSub; result += 1) {
    for (let sub = 1; sub <= 9; sub += 1) {
      const first = result + sub;
      if (first <= settings.maxAddSub && Math.floor(first / 10) !== Math.floor(result / 10)) {
        pool.push(makeTask(`sub:${first}:${sub}`, `${first} - ${sub} = ?`, result));
        if (settings.includeGaps) {
          pool.push(makeTask(`gap-sub:${first}:${sub}`, `${first} - ? = ${result}`, sub));
        }
      }
    }
  }

  return shuffle(pool);
}

function shuffle(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

function loadRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return records && typeof records === 'object' ? records : {};
  } catch {
    return {};
  }
}

function saveRecord(mode, result) {
  const records = loadRecords();
  const current = records[mode] || { score: 0, seconds: 0, streak: 0 };
  records[mode] = {
    score: Math.max(current.score || 0, result.score),
    seconds: Math.max(current.seconds || 0, result.seconds),
    streak: Math.max(current.streak || 0, result.streak),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // If storage is blocked, the current result still works without a record.
  }
  return records[mode];
}

function scoreForCorrectAnswer() {
  const mode = MODES[activeMode];
  const streakBonus = Math.floor(streak / 5) * 2;
  return Math.round((10 + streakBonus) * mode.scoreMultiplier);
}

function nextTask() {
  if (tasks.length === 0) {
    tasks = buildTasks(activeMode);
  }
  currentTask = tasks.pop();
  problemEl.textContent = currentTask.text;
  answerInput.value = '';
  answerInput.focus({ preventScroll: true });
}

function startGame(mode = activeMode) {
  activeMode = mode;
  tasks = buildTasks(activeMode);
  timeLeft = INITIAL_TIME;
  score = 0;
  streak = 0;
  bestStreak = 0;
  solvedCount = 0;
  survivalSeconds = 0;
  isPlaying = true;
  lastFrame = performance.now();
  updateStats();
  updateTimeBar();
  showScreen('game');
  nextTask();
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(tick);
}

function tick(now) {
  if (!isPlaying) return;

  const deltaSeconds = (now - lastFrame) / 1000;
  lastFrame = now;
  survivalSeconds += deltaSeconds;
  timeLeft = Math.max(0, timeLeft - deltaSeconds * MODES[activeMode].drainPerSecond);
  updateStats();
  updateTimeBar();

  if (timeLeft <= 0) {
    endGame();
    return;
  }

  animationId = requestAnimationFrame(tick);
}

function updateTimeBar() {
  timeFill.style.setProperty('--time-left', `${timeLeft}%`);
}

function updateStats() {
  modeLabel.textContent = MODES[activeMode].label;
  survivalTimeEl.textContent = formatTime(survivalSeconds);
  scoreEl.textContent = score;
  streakEl.textContent = streak;
}

function checkAnswer() {
  if (!isPlaying || !currentTask) return;

  const answer = answerInput.value.trim();
  if (answer === '') return;

  if (answer === currentTask.answer) {
    streak += 1;
    score += scoreForCorrectAnswer();
    bestStreak = Math.max(bestStreak, streak);
    solvedCount += 1;
    timeLeft = Math.min(INITIAL_TIME, timeLeft + MODES[activeMode].rewardTime);
    flash('flash-good');
    updateStats();
    updateTimeBar();
    nextTask();
  } else {
    streak = 0;
    timeLeft = Math.max(0, timeLeft - MODES[activeMode].wrongPenalty);
    answerInput.value = '';
    flash('flash-bad');
    updateStats();
    updateTimeBar();
  }
}

function flash(className) {
  problemCard.classList.remove('flash-good', 'flash-bad');
  window.requestAnimationFrame(() => {
    problemCard.classList.add(className);
    window.setTimeout(() => problemCard.classList.remove(className), 220);
  });
}

function endGame() {
  isPlaying = false;
  cancelAnimationFrame(animationId);
  const record = saveRecord(activeMode, {
    score,
    seconds: Math.floor(survivalSeconds),
    streak: bestStreak,
  });
  finalScore.textContent = `${score} ${score === 1 ? 'Punkt' : 'Punkte'}`;
  finalModeEl.textContent = MODES[activeMode].label;
  finalTimeEl.textContent = formatTime(survivalSeconds);
  bestStreakEl.textContent = bestStreak;
  solvedCountEl.textContent = solvedCount;
  recordLine.textContent = `Bestzeit ${MODES[activeMode].label}: ${formatTime(record.seconds)} · Rekordpunkte: ${record.score}`;
  showScreen('end');
}

modeButtons.forEach((button) => {
  button.addEventListener('click', () => startGame(button.dataset.mode));
});

restartButton.addEventListener('click', () => startGame(activeMode));
changeModeButton.addEventListener('click', () => showScreen('start'));
answerButton.addEventListener('click', () => {
  checkAnswer();
  answerInput.focus({ preventScroll: true });
});

answerInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    checkAnswer();
  }
});

answerInput.addEventListener('input', () => {
  answerInput.value = answerInput.value.replace(/[^0-9]/g, '');
});

window.addEventListener('pointerdown', () => {
  if (isPlaying) answerInput.focus({ preventScroll: true });
});

showScreen('start');
updateTimeBar();
