<template>
  <div class="scoreboard-slide">
    <header class="scoreboard-heading">
      <svg class="scoreboard-heading-icon" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M14 7h20v9c0 9-4 15-10 15S14 25 14 16V7Zm0 4H7v5c0 6 3 9 8 9m19-14h7v5c0 6-3 9-8 9M24 31v7m-9 4h18m-16-4h14" />
      </svg>
      <h1>Das Scoreboard macht Erfolge sichtbar</h1>
    </header>

    <main class="scoreboard-main">
      <figure class="scoreboard-visual">
        <img src="/game-assets/Scoreboard.png" alt="Mini-Golf-Rangliste mit Spielern und Punkteständen" />
        <figcaption>Mini-Golf-Leaderboard</figcaption>
      </figure>

      <section class="scoreboard-points" aria-label="Scoreboard-Funktionen">
        <article>
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M16 3 19.8 11l8.7 1.3-6.3 6.1 1.5 8.6-7.7-4.1-7.7 4.1 1.5-8.6-6.3-6.1 8.7-1.3L16 3Z" />
          </svg>
          <div>
            <h2>Rangliste</h2>
          </div>
        </article>
        <article>
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M16 4v24m8-20H12a5 5 0 0 0 0 10h8a5 5 0 0 1 0 10H7" />
          </svg>
          <div>
            <h2>Punkte</h2>
          </div>
        </article>
        <article>
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M5 24 12 17l5 4 10-12m-8 0h8v8" />
          </svg>
          <div>
            <h2>Direktes Feedback</h2>
          </div>
        </article>
      </section>
    </main>
  </div>
</template>

<style scoped>
.scoreboard-slide {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: clamp(16px, 2.5vh, 28px);
  width: 100%;
  height: 100%;
  padding: clamp(28px, 4.5vh, 48px) clamp(34px, 7vw, 90px);
  overflow: hidden;
  background:
    radial-gradient(ellipse at 76% 65%, #e9f5ef 0, #f8faf8 45%, #fff 80%);
  color: #17231f;
  font-family: 'Manrope', 'Segoe UI', sans-serif;
}

.scoreboard-slide * { box-sizing: border-box; }

.scoreboard-heading {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
}

.scoreboard-heading-icon {
  flex: 0 0 clamp(36px, 4vw, 48px);
  width: clamp(36px, 4vw, 48px);
  fill: none;
  stroke: #218768;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.5;
}

.scoreboard-heading h1 {
  margin: 0;
  color: #17231f;
  font-size: clamp(26px, 3.1vw, 38px);
  font-weight: 800;
  letter-spacing: -.065em;
  line-height: 1.08;
}

.scoreboard-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(270px, .95fr);
  align-items: center;
  gap: clamp(28px, 6vw, 78px);
  width: 100%;
  max-width: 1040px;
  min-height: 0;
  margin: 0 auto;
}

.scoreboard-visual {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 0;
  max-height: 100%;
  margin: 0;
}

.scoreboard-visual img {
  display: block;
  width: auto;
  max-width: min(100%, 410px);
  max-height: 48vh;
  border: 1px solid #e3e6ee;
  border-radius: 20px;
  background: #eef0f7;
  box-shadow: 0 24px 58px rgb(23 35 31 / 13%);
  object-fit: contain;
}

.scoreboard-visual figcaption {
  margin-top: 9px;
  color: #748079;
  font-size: clamp(10px, .9vw, 12px);
  font-weight: 700;
}

.scoreboard-points {
  display: grid;
  gap: clamp(12px, 2vh, 20px);
}

.scoreboard-points article {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: clamp(14px, 1.8vw, 22px);
  border: 1.5px solid #253d33;
  border-radius: 19px 15px 21px 16px / 15px 20px 14px 19px;
  background: #fffefa;
  box-shadow: 3px 4px 0 rgb(53 180 141 / 16%), 0 14px 32px rgb(24 60 45 / 7%);
}

.scoreboard-points article > svg {
  flex: 0 0 30px;
  width: 30px;
  margin-top: 2px;
  fill: none;
  stroke: #218768;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.2;
}

.scoreboard-points h2 {
  margin: 0;
  color: #17231f;
  font-size: clamp(17px, 1.8vw, 23px);
  font-weight: 800;
  letter-spacing: -.05em;
}

@media (max-width: 700px) {
  .scoreboard-main { grid-template-columns: minmax(0, 1fr) minmax(220px, .9fr); gap: 18px; }
  .scoreboard-visual img { max-height: 42vh; }
}

@media (max-height: 590px) {
  .scoreboard-slide { gap: 12px; padding-top: 18px; padding-bottom: 18px; }
  .scoreboard-visual img { max-height: 42vh; }
  .scoreboard-points { gap: 8px; }
}
</style>
