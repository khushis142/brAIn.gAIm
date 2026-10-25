<script setup lang="ts">
const games = [
  { name: 'Doodle Jump', image: '/game-assets/Doodle%20jump.png', alt: 'Doodle Jump mit einer Frage zu FIFO und LIFO' },
  { name: 'Mini-Golf', image: '/game-assets/golf.png', alt: 'Mini-Golf-Frage auf einem grünen Parcours' },
  { name: 'Brainjack', image: '/game-assets/lumberjack.png', alt: 'Brainjack-Quiz mit einer Informatikfrage' },
  { name: 'Runner', image: '/game-assets/runner%20man.png', alt: 'Runner-Spiel mit drei Antwortbahnen' },
  { name: 'Story Time', image: '/game-assets/storygen.png', alt: 'Story-Time-Spiel mit einer interaktiven Geschichte' },
]
</script>

<template>
  <div class="games-slide">
    <header class="games-heading">
      <span class="games-eyebrow">MINIGAMES IN AKTION</span>
      <h1>Wähle dein Minigame</h1>
    </header>

    <main class="games-slider" aria-label="Automatisch laufende Auswahl der Minigames">
      <div class="carousel-window">
        <div class="slider-track">
          <article
            v-for="(game, index) in [...games, ...games]"
            :key="`${game.name}-${index}`"
            class="game-card"
            :aria-hidden="index >= games.length ? 'true' : undefined"
          >
            <div class="game-card-heading">
              <h2>{{ game.name }}</h2>
            </div>
            <img :src="game.image" :alt="game.alt" />
          </article>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.games-slide {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  gap: clamp(12px, 2vh, 22px);
  width: 100%;
  height: 100%;
  padding: clamp(24px, 4vh, 42px) clamp(30px, 5.5vw, 72px);
  overflow: hidden;
  background:
    radial-gradient(ellipse at 88% 62%, #e8f5ef 0, #f8faf8 44%, #fff 78%);
  color: #17231f;
  font-family: 'Manrope', 'Segoe UI', sans-serif;
}

.games-slide * {
  box-sizing: border-box;
}

.games-heading {
  width: 100%;
  max-width: 1160px;
  margin: 0 auto;
}

.games-eyebrow {
  color: #218768;
  font-size: clamp(9px, .9vw, 12px);
  font-weight: 800;
  letter-spacing: .15em;
}

.games-heading h1 {
  margin: 8px 0 0;
  color: #17231f;
  font-size: clamp(28px, 3.5vw, 44px);
  font-weight: 800;
  letter-spacing: -.065em;
  line-height: 1.08;
}

.games-slider {
  display: flex;
  align-items: center;
  min-width: 0;
  width: calc(100% + clamp(30px, 5.5vw, 72px));
  max-width: none;
  min-height: 0;
  margin: 0 0 0 calc(-1 * clamp(30px, 5.5vw, 72px));
}

.carousel-window {
  width: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 12px 0 18px;
}

.slider-track {
  display: flex;
  width: max-content;
  gap: clamp(14px, 2vw, 24px);
  animation: games-scroll 60s linear infinite;
  will-change: transform;
}

.game-card {
  display: flex;
  flex: 0 0 clamp(190px, 21vw, 250px);
  flex-direction: column;
  align-items: center;
  min-width: clamp(190px, 21vw, 250px);
  min-height: 0;
  padding: clamp(10px, 1.2vw, 16px);
  border: 1.5px solid #253d33;
  border-radius: 20px 16px 22px 17px / 16px 21px 15px 20px;
  background: #fffefa;
  box-shadow: 3px 4px 0 rgb(53 180 141 / 17%), 0 14px 32px rgb(24 60 45 / 8%);
}

.game-card-heading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(12px, 2vw, 24px);
  width: 100%;
  min-height: 40px;
  margin-bottom: 8px;
}

.game-card h2 {
  min-width: 0;
  margin: 0;
  color: #17231f;
  font-size: clamp(18px, 1.8vw, 23px);
  font-weight: 800;
  letter-spacing: -.055em;
}

.game-card img {
  display: block;
  width: 100%;
  height: clamp(210px, 34vh, 280px);
  border: 1px solid #e5ebe7;
  border-radius: 13px;
  background: #f4f7f5;
  object-fit: contain;
}

@keyframes games-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(calc(-50% - clamp(7px, 1vw, 12px))); }
}

@media (max-width: 760px) {
  .games-slide { overflow-y: auto; }
  .game-card { flex-basis: 58vw; min-width: 58vw; }
  .game-card img { height: min(38vh, 260px); }
}

@media (max-height: 590px) {
  .games-slide { gap: 12px; padding-top: 18px; padding-bottom: 18px; }
  .game-card img { height: 30vh; }
}

@media (prefers-reduced-motion: reduce) {
  .slider-track { animation: none; }
}
</style>
