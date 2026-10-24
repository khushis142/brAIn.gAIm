// Placeholder multiple-choice quiz: one question per concept, score = share answered correctly.
const QUESTIONS = [
  { conceptId: "largest-planet", text: "Which planet is the largest?", options: ["Earth", "Jupiter", "Mars"], answer: 1 },
  { conceptId: "red-planet", text: "Which planet is called the red planet?", options: ["Mars", "Venus", "Mercury"], answer: 0 },
  { conceptId: "ringed-planet", text: "Which planet has the brightest rings?", options: ["Neptune", "Uranus", "Saturn"], answer: 2 },
];

let current = 0;
let correctCount = 0;
let shownAt = 0;

function show() {
  const question = QUESTIONS[current];
  document.body.innerHTML = "";
  const title = document.createElement("h2");
  title.textContent = question.text;
  document.body.appendChild(title);
  question.options.forEach((option, index) => {
    const button = document.createElement("button");
    button.textContent = option;
    button.style.cssText = "display:block;width:100%;margin:8px 0;padding:16px;font-size:18px";
    button.onclick = () => choose(index);
    document.body.appendChild(button);
  });
  shownAt = Date.now();
}

function choose(index) {
  const question = QUESTIONS[current];
  const correct = index === question.answer;
  if (correct) correctCount += 1;
  BrainGain.answer({ conceptId: question.conceptId, correct, ms: Date.now() - shownAt });
  current += 1;
  BrainGain.progress(current / QUESTIONS.length);
  if (current < QUESTIONS.length) {
    show();
  } else {
    BrainGain.complete({ score: Math.round((100 * correctCount) / QUESTIONS.length) });
  }
}

BrainGain.onInit(show);
BrainGain.ready();
