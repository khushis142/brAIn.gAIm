// Example multiple-choice quiz driven entirely by the generated input (see config.json).
// The input is data from an LLM: render it with textContent only, never innerHTML.
let questions = [];
let current = 0;
let correctCount = 0;
let shownAt = 0;

function show() {
  const question = questions[current];
  document.body.replaceChildren();
  const title = document.createElement("h2");
  title.textContent = question.question;
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
  const correct = index === questions[current].answer;
  if (correct) correctCount += 1;
  BrainGain.answer({ conceptId: `q${current}`, correct, ms: Date.now() - shownAt });
  current += 1;
  BrainGain.progress(current / questions.length);
  if (current < questions.length) {
    show();
  } else {
    BrainGain.complete({ score: Math.round((100 * correctCount) / questions.length) });
  }
}

BrainGain.onInit((input) => {
  questions = input.questions;
  show();
});
BrainGain.ready();
