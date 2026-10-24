// Placeholder ordering game: tap the inner planets from the sun outwards; each mistake costs 25 points.
const ORDER = ["Mercury", "Venus", "Earth", "Mars"];
const SHUFFLED = ["Earth", "Mercury", "Mars", "Venus"];

let next = 0;
let mistakes = 0;
let shownAt = 0;

function show() {
  document.body.innerHTML = "";
  const title = document.createElement("h2");
  title.textContent = "Tap the planets from the sun outwards";
  document.body.appendChild(title);
  SHUFFLED.forEach((planet) => {
    const button = document.createElement("button");
    button.textContent = planet;
    button.style.cssText = "display:block;width:100%;margin:8px 0;padding:16px;font-size:18px";
    button.onclick = () => tap(planet, button);
    document.body.appendChild(button);
  });
  shownAt = Date.now();
}

function tap(planet, button) {
  const correct = planet === ORDER[next];
  BrainGain.answer({ conceptId: "planet-order", correct, ms: Date.now() - shownAt });
  shownAt = Date.now();
  if (!correct) {
    mistakes += 1;
    return;
  }
  button.disabled = true;
  next += 1;
  BrainGain.progress(next / ORDER.length);
  if (next === ORDER.length) {
    BrainGain.complete({ score: Math.max(0, 100 - 25 * mistakes) });
  }
}

BrainGain.onInit(show);
BrainGain.ready();
