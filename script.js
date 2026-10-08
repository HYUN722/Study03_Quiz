/* 작성일: 2026-10-07 22:22 (KST) */
/* 수정일: 2026-10-07 22:29 (KST) */
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

/** 점수를 화면에 쓸 문자열로. 정수는 소수점 없이, 0.5 단위는 소수 한 자리로. */
function formatScore(score) {
  return score % 1 === 0 ? String(score) : score.toFixed(1);
}

/**
 * 문항 하나에서 얻는 점수. (PRD 2절 표)
 * 1단계는 연습 모드뿐이라 정답 1점, 오답 0점이다.
 */
function scoreForAnswer(isCorrect) {
  return isCorrect ? 1 : 0;
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
  practice: { name: '연습',   timeLimit: null, hint: false, ranked: false, retry: true  },
  speed:    { name: '스피드', timeLimit: 15,   hint: false, ranked: true,  retry: false },
  hint:     { name: '힌트',   timeLimit: null, hint: true,  ranked: true,  retry: false }
};

/* PRD 5.4절 */
var state = {
  screen: 'start',
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
      startRound('practice', category.id);
    });
    container.appendChild(button);
  });
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

  var isCorrect = choiceIndex === question.answer;

  state.answered = true;
  state.score += scoreForAnswer(isCorrect);
  if (!isCorrect) state.wrong.push(question);

  document.getElementById('current-score').textContent =
    formatScore(state.score) + '점';

  markChoices(question.answer, choiceIndex);
  showExplanation(question, isCorrect);
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
function showExplanation(question, isCorrect) {
  var box = document.getElementById('explanation');
  box.textContent = '';
  box.classList.remove('is-correct', 'is-wrong');
  box.classList.add(isCorrect ? 'is-correct' : 'is-wrong');

  var verdict = document.createElement('p');
  verdict.className = 'verdict';
  verdict.textContent = isCorrect ? '정답입니다' : '오답입니다';

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
  }
}

/* ===== 결과 화면 ===== */

/** 판이 끝난 뒤 점수와 맞힌/틀린 수를 보여 준다. */
function renderResult() {
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
  renderCategoryButtons();
  document.getElementById('practice-notice').textContent = NOT_RANKED_NOTICE;
  document.getElementById('next-button').addEventListener('click', handleNext);
  document.getElementById('home-button').addEventListener('click', function () {
    showScreen('start');
  });
  showScreen('start');
}

document.addEventListener('DOMContentLoaded', init);
