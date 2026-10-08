/* 작성일: 2026-10-07 22:22 (KST) */
/* 수정일: 2026-10-08 14:52 (KST) */
/*
 * 상식 퀴즈 앱.
 *
 * 구조: 파일 앞쪽은 화면을 건드리지 않는 순수 함수, 뒤쪽은 화면을 그리는 코드.
 * 화면 접근은 init() 안에서만 한다. init() 은 DOMContentLoaded 에서만 불린다.
 * 그래서 이 파일을 Node.js 로 그대로 불러 selfCheck() 를 돌릴 수 있다.
 */

var CHOICE_COUNT = 4;
var QUESTIONS_PER_ROUND = 10;
var CATEGORY_COUNT = 4;

/* ===== 순수 함수: 문항 검증 ===== */

/**
 * 문항 데이터가 PRD 4.4절의 규칙을 지키는지 확인한다.
 * @param {Array} categories - [{ id, name }]
 * @param {Object} questionsByCategory - { [categoryId]: Question[] }
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateQuestions(categories, questionsByCategory) {
  var errors = [];
  var warnings = [];
  var seenIds = Object.create(null);

  if (!categories || categories.length !== CATEGORY_COUNT) {
    errors.push(
      '카테고리 정의가 ' + CATEGORY_COUNT + '개가 아닙니다 (현재 ' +
      (categories ? categories.length : 0) + '개)'
    );
  }

  (categories || []).forEach(function (category) {
    var list = questionsByCategory ? questionsByCategory[category.id] : undefined;

    if (!list) {
      errors.push(category.id + ': 문항이 없습니다');
      return;
    }
    if (list.length !== QUESTIONS_PER_ROUND) {
      errors.push(
        category.id + ': 문항이 ' + QUESTIONS_PER_ROUND + '개가 아닙니다 (현재 ' +
        list.length + '개)'
      );
    }

    list.forEach(function (question, i) {
      var where = category.id + ' ' + (i + 1) + '번: ';

      ['question', 'explanation', 'source'].forEach(function (field) {
        if (typeof question[field] !== 'string' || question[field].trim() === '') {
          errors.push(where + field + '이 비어 있습니다');
        }
      });

      if (typeof question.id !== 'string' || question.id.trim() === '') {
        errors.push(where + 'id가 비어 있습니다');
      } else if (seenIds[question.id]) {
        errors.push(where + 'id가 중복됩니다 (' + question.id + ')');
      } else {
        seenIds[question.id] = true;
      }

      if (!question.choices || question.choices.length !== CHOICE_COUNT) {
        errors.push(
          where + '보기가 ' + CHOICE_COUNT + '개가 아닙니다 (현재 ' +
          (question.choices ? question.choices.length : 0) + '개)'
        );
      } else {
        if (hasDuplicate(question.choices)) {
          errors.push(where + '보기가 중복됩니다');
        }
        question.choices.forEach(function (choice, c) {
          if (typeof choice !== 'string' || choice.trim() === '') {
            errors.push(where + (c + 1) + '번 보기가 비어 있습니다');
          }
        });
      }

      if (
        typeof question.answer !== 'number' ||
        question.answer % 1 !== 0 ||
        question.answer < 0 ||
        question.answer >= CHOICE_COUNT
      ) {
        errors.push(
          where + 'answer가 0~' + (CHOICE_COUNT - 1) + '이 아닙니다 (' +
          question.answer + ')'
        );
      }

      if (needsSuperlativeBasis(question.question)) {
        warnings.push(where + '최상급 표현에 기준이나 시점이 없습니다');
      }
    });
  });

  return { errors: errors, warnings: warnings };
}

/** 배열에 같은 값이 둘 이상 있는지. */
function hasDuplicate(values) {
  for (var i = 0; i < values.length; i++) {
    for (var j = i + 1; j < values.length; j++) {
      if (values[i] === values[j]) return true;
    }
  }
  return false;
}

/**
 * "가장" 을 쓰면서 기준(연도 네 자리 또는 "기준")을 밝히지 않았는지.
 * PRD 4.2절 규칙 3의 보조 장치이므로 경고만 낸다.
 */
function needsSuperlativeBasis(text) {
  if (typeof text !== 'string') return false;
  if (text.indexOf('가장') === -1) return false;
  return !/\d{4}|기준/.test(text);
}

/* ===== 순수 함수: 섞기와 점수 ===== */

/**
 * 배열을 섞은 새 배열을 돌려준다. 원본은 바꾸지 않는다. (Fisher-Yates)
 * @param {Array} items
 * @param {Function} [randomFn] - 0 이상 1 미만을 돌려주는 함수. 기본값 Math.random
 */
function shuffleArray(items, randomFn) {
  var random = randomFn || Math.random;
  var result = items.slice();

  for (var i = result.length - 1; i > 0; i--) {
    var j = Math.floor(random() * (i + 1));
    var swap = result[i];
    result[i] = result[j];
    result[j] = swap;
  }
  return result;
}

/**
 * 보기 순서를 섞고 정답 위치를 다시 계산한 문항을 돌려준다. 원본은 바꾸지 않는다.
 * 보기를 { text, correct } 로 감싸 섞은 뒤 correct 가 있는 자리를 answer 로 삼는다.
 * 글자를 비교해 정답을 찾으면 같은 글자가 둘 있을 때 엉킨다.
 */
function prepareQuestion(question, randomFn) {
  var wrapped = question.choices.map(function (text, index) {
    return { text: text, correct: index === question.answer };
  });
  var shuffled = shuffleArray(wrapped, randomFn);
  var answer = -1;

  for (var i = 0; i < shuffled.length; i++) {
    if (shuffled[i].correct) {
      answer = i;
      break;
    }
  }

  return {
    id: question.id,
    question: question.question,
    choices: shuffled.map(function (item) { return item.text; }),
    answer: answer,
    explanation: question.explanation,
    source: question.source
  };
}

/** 카테고리의 문항 순서와 각 문항의 보기 순서를 섞어 한 판의 문항을 만든다. */
function prepareRound(categoryId, randomFn) {
  var list = QUIZ_QUESTIONS[categoryId] || [];

  return shuffleArray(list, randomFn).map(function (question) {
    return prepareQuestion(question, randomFn);
  });
}

/**
 * 힌트로 지울 보기 2개의 인덱스를 돌려준다. 정답은 절대 고르지 않는다.
 * 보기가 4개이므로 오답 3개 중에서 2개를 뽑는다.
 * @param {number} answerIndex - 정답 보기의 인덱스
 * @param {Function} [randomFn] - 0 이상 1 미만을 돌려주는 함수. 기본값 Math.random
 * @returns {number[]} 서로 다른 두 인덱스
 */
function pickHintTargets(answerIndex, randomFn) {
  var candidates = [];

  for (var i = 0; i < CHOICE_COUNT; i++) {
    if (i !== answerIndex) candidates.push(i);
  }
  return shuffleArray(candidates, randomFn).slice(0, 2);
}

/** 점수를 화면에 쓸 문자열로. 정수는 소수점 없이, 0.5 단위는 소수 한 자리로. */
function formatScore(score) {
  return score % 1 === 0 ? String(score) : score.toFixed(1);
}

/**
 * 문항 하나에서 얻는 점수. (PRD 2절 표)
 *
 *   연습·스피드 정답                     → 1
 *   힌트 모드에서 힌트를 안 쓰고 정답    → 1
 *   힌트 모드에서 힌트를 쓰고 정답       → 0.5
 *   오답·시간 초과                       → 0
 *
 * @param {boolean} isCorrect
 * @param {string} [mode] - MODES 의 키. 없으면 연습으로 본다
 * @param {boolean} [hintUsed] - 이 문항에서 힌트를 썼는지
 */
function scoreForAnswer(isCorrect, mode, hintUsed) {
  if (!isCorrect) return 0;

  var modeInfo = MODES[mode] || MODES.practice;
  return modeInfo.hint && hintUsed ? 0.5 : 1;
}

/**
 * 점수를 더한다. 0.5 를 거듭 더하면 4.999... 가 나오므로,
 * 2배 정수로 바꾸어 반올림한 뒤 되돌린다 (PRD 2.4절).
 */
function addScore(total, gain) {
  return Math.round((total + gain) * 2) / 2;
}

/* ===== 자체 점검 ===== */
/*
 * 브라우저에서는 쓰지 않는다. 터미널에서 아래 한 줄로 부른다.
 *
 * node -e "const fs=require('fs'),vm=require('vm');const s={console,document:{addEventListener(){}},window:{}};s.globalThis=s;vm.createContext(s);for(const f of ['questions.js','script.js'])vm.runInContext(fs.readFileSync(f,'utf8'),s);console.log(s.selfCheck())"
 */

function selfCheck() {
  var lines = [];
  var failed = 0;

  function check(label, ok, detail) {
    if (!ok) failed++;
    lines.push((ok ? '  OK   ' : '  FAIL ') + label + (detail ? ' — ' + detail : ''));
  }

  lines.push('[태스크 3-4] 문항 데이터');
  var result = validateQuestions(QUIZ_CATEGORIES, QUIZ_QUESTIONS);
  check('검증 오류 0건', result.errors.length === 0, result.errors.join(' / '));
  check('검증 경고 0건', result.warnings.length === 0, result.warnings.join(' / '));
  QUIZ_CATEGORIES.forEach(function (category) {
    var list = QUIZ_QUESTIONS[category.id] || [];
    check(category.id + ' 문항 10개', list.length === 10, '현재 ' + list.length + '개');
  });

  lines.push('');
  lines.push('[태스크 5] 섞기와 점수');

  var source = [1, 2, 3, 4, 5];
  var shuffled = shuffleArray(source);
  check('shuffleArray 가 원본을 바꾸지 않는다', source.join() === '1,2,3,4,5');
  check('shuffleArray 가 원소를 모두 유지한다',
    shuffled.slice().sort().join() === '1,2,3,4,5');

  var sample = {
    id: 'x-01', question: '문제', choices: ['가', '나', '다', '라'],
    answer: 2, explanation: '해설', source: '출처'
  };
  var answerKept = true;
  for (var n = 0; n < 50; n++) {
    var prepared = prepareQuestion(sample);
    if (prepared.choices[prepared.answer] !== '다') answerKept = false;
    if (prepared.choices.length !== 4) answerKept = false;
  }
  check('prepareQuestion 이 50번 모두 정답을 지킨다', answerKept);
  check('prepareQuestion 이 원본을 바꾸지 않는다',
    sample.answer === 2 && sample.choices.join() === '가,나,다,라');

  var round = prepareRound('science');
  var roundIds = {};
  var uniqueIds = 0;
  round.forEach(function (q) {
    if (!roundIds[q.id]) { roundIds[q.id] = true; uniqueIds++; }
  });
  check('prepareRound 가 10문항을 돌려준다', round.length === 10);
  check('prepareRound 의 id 가 중복되지 않는다', uniqueIds === 10);

  check('formatScore(8) === "8"', formatScore(8) === '8');
  check('formatScore(0) === "0"', formatScore(0) === '0');
  check('formatScore(7.5) === "7.5"', formatScore(7.5) === '7.5');
  check('scoreForAnswer(true) === 1', scoreForAnswer(true) === 1);
  check('scoreForAnswer(false) === 0', scoreForAnswer(false) === 0);

  lines.push('');
  lines.push('[태스크 12] 모드별 점수 (PRD 2절 표)');

  check('연습 정답 1점', scoreForAnswer(true, 'practice', false) === 1);
  check('스피드 정답 1점', scoreForAnswer(true, 'speed', false) === 1);
  check('힌트 모드에서 힌트 안 쓰고 정답 1점', scoreForAnswer(true, 'hint', false) === 1);
  check('힌트 모드에서 힌트 쓰고 정답 0.5점', scoreForAnswer(true, 'hint', true) === 0.5);
  check('오답 0점', scoreForAnswer(false, 'practice', false) === 0);
  check('힌트 쓰고 오답 0점', scoreForAnswer(false, 'hint', true) === 0);

  var halfSum = 0;
  for (var h = 0; h < 10; h++) {
    halfSum = addScore(halfSum, 0.5);
  }
  check('0.5 를 열 번 더한 값이 정확히 5', halfSum === 5, '현재 ' + halfSum);
  check('그 점수의 표시가 "5"', formatScore(halfSum) === '5');

  var hintTotal = 0;
  for (var k = 0; k < 10; k++) {
    hintTotal = addScore(hintTotal, scoreForAnswer(true, 'hint', k < 5));
  }
  check('힌트를 다섯 번 쓰고 열 문제를 다 맞힌 합계가 7.5', hintTotal === 7.5,
    '현재 ' + hintTotal);

  var allHint = 0;
  for (var m = 0; m < 10; m++) {
    allHint = addScore(allHint, scoreForAnswer(true, 'hint', true));
  }
  check('매 문항 힌트를 쓰고 다 맞힌 합계가 5', allHint === 5, '현재 ' + allHint);

  lines.push('');
  lines.push('[태스크 11] 힌트로 지울 보기 고르기');

  var hintOk = true;
  var hintTwo = true;
  var hintDistinct = true;
  for (var a = 0; a < CHOICE_COUNT; a++) {
    for (var t = 0; t < 50; t++) {
      var targets = pickHintTargets(a);
      if (!targets || targets.length !== 2) { hintTwo = false; continue; }
      if (targets.indexOf(a) !== -1) hintOk = false;
      if (targets[0] === targets[1]) hintDistinct = false;
    }
  }
  check('pickHintTargets 가 항상 2개를 돌려준다', hintTwo);
  check('pickHintTargets 가 정답 인덱스를 한 번도 고르지 않는다', hintOk);
  check('pickHintTargets 의 두 값이 항상 서로 다르다', hintDistinct);

  lines.push('');
  lines.push('[태스크 8] 한 판 점수');

  var playRound = prepareRound('korean-history');
  var total = 0;
  playRound.forEach(function (q, i) {
    total += scoreForAnswer(i >= 3);   // 앞 3문항은 오답, 나머지는 정답
  });
  check('10문항 중 3개를 틀린 판의 합계가 7점', total === 7, '현재 ' + total);
  check('그 점수의 표시가 "7"', formatScore(total) === '7');
  check('만점 판의 합계가 10점',
    playRound.reduce(function (sum) { return sum + scoreForAnswer(true); }, 0) === 10);

  lines.push('');
  lines.push(failed === 0 ? '모두 통과' : failed + '건 실패');
  return lines.join('\n');
}

/* ===== 모드와 판 상태 ===== */
/*
 * PRD 5.3절. 모드의 차이를 분기로 흩뿌리지 않고 이 표 하나에 모은다.
 * 1단계에서 읽는 것은 practice 뿐이고 speed, hint 는 2단계에서 쓴다.
 */
var MODES = {
  practice: {
    name: '연습', rule: '시간 제한 없이 풀기',
    timeLimit: null, hint: false, ranked: false, retry: true
  },
  speed: {
    name: '스피드', rule: '문항당 15초',
    timeLimit: 15, hint: false, ranked: true, retry: false
  },
  hint: {
    name: '힌트', rule: '오답 2개 지우기 · 쓰고 맞히면 0.5점',
    timeLimit: null, hint: true, ranked: true, retry: false
  }
};

/* 시작 화면에 버튼을 늘어놓는 순서. MODES 의 키 순서에 의존하지 않는다. */
var MODE_ORDER = ['practice', 'speed', 'hint'];

/* PRD 5.4절 */
var state = {
  screen: 'start',
  selectedMode: 'practice',
  mode: null,
  categoryId: null,
  questions: [],
  index: 0,
  score: 0,
  hintUsed: false,
  answered: false,
  wrong: [],
  retrying: false,
  remaining: null,
  timerId: null
};

var NOT_RANKED_NOTICE = '순위표에 기록되지 않음';

/** 현재 문항. 판이 끝났으면 undefined. */
function currentQuestion() {
  return state.questions[state.index];
}

/** 현재 문항이 이 판의 마지막 문항인지. */
function isLastQuestion() {
  return state.index === state.questions.length - 1;
}

/* ===== 화면 ===== */
/* 여기서부터 DOM 을 건드린다. init() 은 DOMContentLoaded 에서만 불린다. */

var SCREEN_IDS = {
  start: 'screen-start',
  quiz: 'screen-quiz',
  result: 'screen-result'
};

/** 화면 하나만 보이게 한다. */
function showScreen(name) {
  var targetId = SCREEN_IDS[name];
  var screens = document.querySelectorAll('.screen');

  for (var i = 0; i < screens.length; i++) {
    if (screens[i].id === targetId) {
      screens[i].classList.add('is-active');
    } else {
      screens[i].classList.remove('is-active');
    }
  }
  state.screen = name;
}

/** 시작 화면에 문제 상황을 알린다. 순위표 안내는 그대로 둔다. */
function showStartError(message) {
  var box = document.getElementById('start-error');
  box.textContent = message;
  box.hidden = false;
}

function clearStartError() {
  var box = document.getElementById('start-error');
  box.textContent = '';
  box.hidden = true;
}

/**
 * 한 판을 시작한다. 상태를 모두 초기화하고 첫 문항을 그린다.
 * 문항을 하나도 불러올 수 없으면 퀴즈 화면으로 넘어가지 않는다(PRD 4.4절).
 * 넘어가면 문제도 보기도 없는 화면에 갇히고, 거기에는 돌아갈 길이 없다.
 */
function startRound(mode, categoryId) {
  var questions = prepareRound(categoryId);

  if (questions.length === 0) {
    showStartError('이 카테고리의 문항을 불러올 수 없습니다. questions.js 를 확인해 주세요.');
    return;
  }
  clearStartError();

  state.mode = mode;
  state.categoryId = categoryId;
  state.questions = questions;
  state.index = 0;
  state.score = 0;
  state.hintUsed = false;
  state.answered = false;
  state.wrong = [];
  state.retrying = false;
  state.remaining = null;

  showScreen('quiz');
  renderQuestion();
  startTimer();
}

/** 현재 문항을 그린다. 해설과 다음 버튼은 숨긴 상태로 시작한다. */
function renderQuestion() {
  var question = currentQuestion();
  if (!question) return;

  state.answered = false;
  state.hintUsed = false;

  document.getElementById('progress').textContent =
    (state.index + 1) + ' / ' + state.questions.length;
  document.getElementById('current-score').textContent =
    formatScore(state.score) + '점';
  document.getElementById('question-text').textContent = question.question;

  renderChoices(question);

  var explanation = document.getElementById('explanation');
  explanation.hidden = true;
  explanation.textContent = '';
  explanation.classList.remove('is-correct', 'is-wrong');

  renderTimeLeft();
  renderHintButton();

  var next = document.getElementById('next-button');
  next.hidden = true;
  next.textContent = isLastQuestion() ? '결과 보기' : '다음';
}

/** 보기 버튼 4개를 새로 만들어 넣는다. 글자는 textContent 로만 넣는다. */
function renderChoices(question) {
  var container = document.getElementById('choices');
  container.textContent = '';

  question.choices.forEach(function (text, index) {
    var button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-choice-index', String(index));

    var mark = document.createElement('span');
    mark.className = 'choice-mark';
    mark.textContent = (index + 1) + '.';

    var label = document.createElement('span');
    label.className = 'choice-text';
    label.textContent = text;

    button.addEventListener('click', function () {
      handleAnswer(index);
    });

    button.appendChild(mark);
    button.appendChild(label);
    container.appendChild(button);
  });
}

/* ===== 모드 선택 (태스크 9) ===== */

/** 시작 화면의 모드 버튼 3개를 만든다. 글자는 textContent 로만 넣는다. */
function renderModeButtons() {
  var container = document.getElementById('mode-buttons');
  container.textContent = '';

  MODE_ORDER.forEach(function (modeId) {
    var mode = MODES[modeId];
    var button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-mode-id', modeId);

    var name = document.createElement('span');
    name.className = 'mode-name';
    name.textContent = mode.name;

    var rule = document.createElement('span');
    rule.className = 'mode-rule';
    rule.textContent = mode.rule;

    button.addEventListener('click', function () {
      selectMode(modeId);
    });

    button.appendChild(name);
    button.appendChild(rule);
    container.appendChild(button);
  });
}

/**
 * 모드를 고른다. 고른 버튼에 표시를 남기고 연습 모드 안내를 켜거나 끈다.
 * 판을 시작하지는 않는다. 카테고리를 누를 때 이 값으로 startRound 를 부른다.
 */
function selectMode(modeId) {
  if (!MODES[modeId]) return;
  state.selectedMode = modeId;

  var buttons = document.querySelectorAll('#mode-buttons button');
  for (var i = 0; i < buttons.length; i++) {
    var isSelected = buttons[i].getAttribute('data-mode-id') === modeId;
    buttons[i].classList.toggle('is-selected', isSelected);
    buttons[i].setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  }

  /* 연습 모드만 순위표에 올라가지 않는다. 빈 문자열이면 .notice:empty 로 숨는다. */
  document.getElementById('practice-notice').textContent =
    MODES[modeId].ranked ? '' : NOT_RANKED_NOTICE;
}

/** 문항 데이터 검증 결과를 콘솔에 남긴다. 걸려도 퀴즈는 그대로 동작한다. */
function reportValidation() {
  var result = validateQuestions(QUIZ_CATEGORIES, QUIZ_QUESTIONS);

  result.errors.forEach(function (message) {
    console.error('[문항 오류] ' + message);
  });
  result.warnings.forEach(function (message) {
    console.warn('[문항 경고] ' + message);
  });
}

/** 시작 화면의 카테고리 버튼을 만든다. */
function renderCategoryButtons() {
  var container = document.getElementById('category-buttons');
  container.textContent = '';

  QUIZ_CATEGORIES.forEach(function (category) {
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = category.name;
    button.setAttribute('data-category-id', category.id);
    button.addEventListener('click', function () {
      startRound(state.selectedMode, category.id);
    });
    container.appendChild(button);
  });
}

/* ===== 힌트 모드 (태스크 11) ===== */

/** 지금 문항에서 힌트를 쓸 수 있는 모드인지. 다시 풀기에서는 쓰지 않는다. */
function hintAvailable() {
  if (state.retrying) return false;
  var mode = MODES[state.mode];
  return !!(mode && mode.hint);
}

/** 힌트 버튼의 표시와 잠금을 지금 상태에 맞춘다. */
function renderHintButton() {
  var button = document.getElementById('hint-button');

  if (!hintAvailable()) {
    button.hidden = true;
    return;
  }
  button.hidden = false;
  button.disabled = state.hintUsed || state.answered;
  button.textContent = state.hintUsed ? '힌트 사용함' : '힌트 (오답 2개 지우기)';
}

/**
 * 오답 보기 2개를 잠그고 흐리게 한다. 화면에서 지우지는 않는다.
 * 지우면 남은 보기가 위로 밀려 올라가 누르려던 자리가 흔들린다(PRD 2.3절).
 * 한 문항에서 한 번만 듣는다(함정 6).
 */
function handleHint() {
  if (state.hintUsed || state.answered || !hintAvailable()) return;

  var question = currentQuestion();
  if (!question) return;

  var targets = pickHintTargets(question.answer);
  var buttons = document.querySelectorAll('#choices button');

  for (var i = 0; i < buttons.length; i++) {
    var index = Number(buttons[i].getAttribute('data-choice-index'));
    if (targets.indexOf(index) !== -1) {
      buttons[i].disabled = true;
      buttons[i].classList.add('is-dimmed');
    }
  }

  state.hintUsed = true;
  renderHintButton();
}

/* ===== 스피드 모드 타이머 (태스크 10) ===== */

/** 이번 판의 제한 시간. 다시 풀기에서는 시간을 재지 않는다(태스크 13). */
function timeLimitForRound() {
  if (state.retrying) return null;
  var mode = MODES[state.mode];
  return mode ? mode.timeLimit : null;
}

/** 남은 시간을 화면에 쓴다. 제한이 없는 모드에서는 숨긴다. */
function renderTimeLeft() {
  var box = document.getElementById('time-left');

  if (timeLimitForRound() === null) {
    box.hidden = true;
    box.textContent = '';
    box.classList.remove('is-urgent');
    return;
  }
  box.hidden = false;
  box.textContent = '남은 시간 ' + state.remaining + '초';
  box.classList.toggle('is-urgent', state.remaining <= 5);
}

/**
 * 남은 시간을 제한 시간으로 두고 1초에 1씩 줄인다.
 * 0 이 되면 멈추고 handleAnswer(-1) 로 시간 초과를 채점한다.
 * 먼저 stopTimer() 를 불러 타이머가 둘 도는 일을 막는다.
 */
function startTimer() {
  stopTimer();

  var limit = timeLimitForRound();
  if (limit === null) {
    renderTimeLeft();
    return;
  }

  state.remaining = limit;
  renderTimeLeft();

  state.timerId = setInterval(function () {
    state.remaining -= 1;
    renderTimeLeft();

    if (state.remaining <= 0) {
      stopTimer();
      handleAnswer(-1);
    }
  }, 1000);
}

/**
 * 타이머를 멈춘다. 남은 시간 숫자는 그대로 둔다.
 * 해설을 읽는 동안 시간이 깎이지 않게 하는 곳이다(함정 5).
 * 몇 번 불러도 괜찮다.
 */
function stopTimer() {
  if (state.timerId !== null) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

/* ===== 채점과 해설 ===== */

/**
 * 답을 확정하고 채점한 뒤 해설을 보여 준다.
 * 이미 확정된 문항이면 아무 일도 하지 않는다. 해설을 보는 중 보기를 다시 눌러도
 * 점수가 또 오르지 않게 막는 곳이다.
 * @param {number} choiceIndex - 고른 보기. 고르지 않고 시간이 다한 경우는 -1.
 */
function handleAnswer(choiceIndex) {
  if (state.answered) return;

  var question = currentQuestion();
  if (!question) return;

  stopTimer();

  var isCorrect = choiceIndex === question.answer;
  var timedOut = choiceIndex === -1;

  state.answered = true;
  if (!state.retrying) {
    state.score = addScore(state.score, scoreForAnswer(isCorrect, state.mode, state.hintUsed));
  }
  if (!isCorrect) state.wrong.push(question);

  document.getElementById('current-score').textContent =
    formatScore(state.score) + '점';

  renderHintButton();
  markChoices(question.answer, choiceIndex);
  showExplanation(question, isCorrect, timedOut);
  document.getElementById('next-button').hidden = false;
}

/** 보기 버튼을 모두 잠그고 정답과 고른 오답을 표시한다. */
function markChoices(answerIndex, pickedIndex) {
  var buttons = document.querySelectorAll('#choices button');

  for (var i = 0; i < buttons.length; i++) {
    var index = Number(buttons[i].getAttribute('data-choice-index'));
    buttons[i].disabled = true;

    if (index === answerIndex) {
      buttons[i].classList.add('is-correct');
    } else if (index === pickedIndex) {
      buttons[i].classList.add('is-wrong');
    }
  }
}

/** 정답 여부와 한 줄 해설, 출처를 보여 준다. */
function showExplanation(question, isCorrect, timedOut) {
  var box = document.getElementById('explanation');
  box.textContent = '';
  box.classList.remove('is-correct', 'is-wrong');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');

  var verdict = document.createElement('p');
  verdict.className = 'verdict';
  verdict.textContent = isCorrect ? '정답입니다' : (timedOut ? '시간 초과' : '오답입니다');

  var text = document.createElement('p');
  text.className = 'explanation-text';
  text.textContent = question.explanation;

  var source = document.createElement('p');
  source.className = 'explanation-source';
  source.textContent = '출처: ' + question.source;

  box.appendChild(verdict);
  box.appendChild(text);
  box.appendChild(source);
  box.hidden = false;
}

/** 다음 문항으로. 마지막 문항이었으면 결과 화면으로 간다. */
function handleNext() {
  state.index += 1;

  if (state.index >= state.questions.length) {
    renderResult();
  } else {
    renderQuestion();
    startTimer();
  }
}

/* ===== 결과 화면 ===== */

/** 판이 끝난 뒤 점수와 맞힌/틀린 수를 보여 준다. */
function renderResult() {
  stopTimer();

  var total = state.questions.length;
  var wrongCount = state.wrong.length;
  var correctCount = total - wrongCount;

  document.getElementById('result-score').textContent =
    formatScore(state.score) + ' / ' + total;
  document.getElementById('result-counts').textContent =
    '맞힌 문제 ' + correctCount + '개 · 틀린 문제 ' + wrongCount + '개';
  document.getElementById('result-notice').textContent =
    MODES[state.mode].ranked ? '' : NOT_RANKED_NOTICE;

  showScreen('result');
}

function init() {
  reportValidation();
  renderModeButtons();
  renderCategoryButtons();
  selectMode(state.selectedMode);
  document.getElementById('next-button').addEventListener('click', handleNext);
  document.getElementById('hint-button').addEventListener('click', handleHint);
  document.getElementById('home-button').addEventListener('click', function () {
    stopTimer();
    showScreen('start');
  });
  showScreen('start');
}

document.addEventListener('DOMContentLoaded', init);
