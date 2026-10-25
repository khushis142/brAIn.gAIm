<template>
  <div class="workflow-slide">
    <header class="slide-heading">
      <span class="eyebrow">VON WISSEN ZU SPIEL</span>
      <h1>Wie funktioniert’s?</h1>
    </header>

    <main class="workflow-main">
      <section class="flow-column" aria-label="So entsteht ein Lernspiel">
        <v-click>
          <article class="flow-card library-card">
            <span class="book-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none">
                <path d="M7 10.5A3.5 3.5 0 0 1 10.5 7H23v31H10.5A3.5 3.5 0 0 0 7 41.5v-31Z" />
                <path d="M41 10.5A3.5 3.5 0 0 0 37.5 7H25v31h12.5a3.5 3.5 0 0 1 3.5 3.5v-31Z" />
                <path d="M13 15h5M13 21h5M30 15h5M30 21h5" />
              </svg>
            </span>
            <div>
              <span class="step-label">DEIN STARTPUNKT</span>
              <h2>Personalisierte<br />Wissensbibliothek</h2>
            </div>
          </article>
        </v-click>

        <v-click>
          <div class="generation-step">
            <svg class="down-arrow" viewBox="0 0 40 58" aria-hidden="true">
              <path d="M20 3v45m-13-13 13 13 13-13" />
            </svg>
            <div class="generation-label">KI-Generierung</div>
          </div>
        </v-click>

        <v-click>
          <div class="game-step" aria-label="Minigames">
            <svg viewBox="0 0 24 24" role="img" aria-label="Material Design Gamepad">
              <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2ZM11 13H8v3H6v-3H3v-2h3V8h2v3h3v2Zm4.5 2a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm4-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
            </svg>
            <span>Minigames</span>
          </div>
        </v-click>
      </section>

      <KnowledgeTabDemo />
    </main>
  </div>
</template>

<style scoped>
.workflow-slide {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: clamp(18px, 3vh, 30px);
  width: 100%;
  height: 100%;
  padding: clamp(28px, 5vh, 54px) clamp(36px, 7vw, 92px);
  overflow: hidden;
  background: radial-gradient(ellipse at 85% 55%, #eaf5f0 0, #f8faf8 43%, #fff 76%);
  color: #17231f;
  font-family: 'Manrope', 'Segoe UI', sans-serif;
}

.workflow-slide * {
  box-sizing: border-box;
}

.slide-heading {
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
}

.eyebrow,
.step-label {
  color: #218768;
  font-size: clamp(9px, .9vw, 12px);
  font-weight: 800;
  letter-spacing: .15em;
}

.slide-heading h1 {
  margin: 9px 0 0;
  color: #17231f;
  font-size: clamp(28px, 3.4vw, 44px);
  font-weight: 800;
  letter-spacing: -.065em;
  line-height: 1.08;
}

.workflow-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, .9fr);
  align-items: center;
  gap: clamp(24px, 5vw, 72px);
  width: 100%;
  max-width: 1060px;
  min-height: 0;
  margin: 0 auto;
}

.flow-column {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: clamp(8px, 1.6vh, 17px);
  min-width: 0;
}

.flow-card {
  display: flex;
  align-items: center;
  gap: clamp(15px, 2.2vw, 28px);
  width: 100%;
  max-width: 470px;
  min-height: 118px;
  padding: clamp(18px, 2.3vw, 28px);
  border: 1.5px solid #253d33;
  border-radius: 24px 18px 25px 19px / 18px 24px 17px 23px;
  background: #fffefa;
  box-shadow: 3px 4px 0 rgb(53 180 141 / 20%), 0 16px 42px rgb(24 60 45 / 8%);
}

.book-icon {
  display: grid;
  flex: 0 0 clamp(52px, 6.4vw, 76px);
  place-items: center;
  width: clamp(52px, 6.4vw, 76px);
  height: clamp(52px, 6.4vw, 76px);
  border-radius: 21px 15px 20px 16px;
  background: #e7f5ee;
  color: #218768;
}

.book-icon svg {
  width: 68%;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.3;
}

.step-label {
  font-size: clamp(8px, .75vw, 10px);
}

.flow-card h2 {
  margin: 8px 0 0;
  color: #17231f;
  font-size: clamp(19px, 2.1vw, 27px);
  font-weight: 800;
  letter-spacing: -.055em;
  line-height: 1.12;
}

.generation-step {
  display: flex;
  align-items: center;
  gap: clamp(16px, 2.5vw, 30px);
  min-height: 72px;
  padding-left: clamp(20px, 3vw, 38px);
}

.down-arrow {
  flex: 0 0 32px;
  width: 32px;
  height: 52px;
  fill: none;
  stroke: #35b48d;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3;
}

.generation-label {
  color: #17231f;
  font-size: clamp(19px, 2vw, 26px);
  font-weight: 800;
  letter-spacing: -.05em;
}

.game-step {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  max-width: 470px;
  min-height: 118px;
  border: 1.5px solid #253d33;
  border-radius: 24px 18px 25px 19px / 18px 24px 17px 23px;
  background: #fffefa;
  box-shadow: 3px 4px 0 rgb(53 180 141 / 20%), 0 16px 42px rgb(24 60 45 / 8%);
  color: #17231f;
}

.game-step svg {
  width: 30px;
  fill: #218768;
}

.game-step span {
  font-size: clamp(19px, 2vw, 26px);
  font-weight: 800;
  letter-spacing: -.05em;
}

@media (max-width: 700px) {
  .workflow-slide {
    padding-right: 28px;
    padding-left: 28px;
  }

  .workflow-main {
    grid-template-columns: minmax(0, 1fr) minmax(175px, .72fr);
    gap: 20px;
  }

  .flow-card {
    gap: 13px;
    min-height: 100px;
    padding: 15px;
  }
  .game-step { min-height: 100px; }
}

@media (max-height: 590px) {
  .workflow-slide {
    gap: 16px;
    padding-top: 22px;
    padding-bottom: 22px;
  }

  .workflow-main {
    gap: 32px;
  }
  .flow-card,
  .game-step { min-height: 96px; }
}
</style>
