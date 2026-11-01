<template>
  <div class="solution-slide">
    <header class="solution-heading">
      <h1>Micro-Learning im Doomscroll-Format</h1>
    </header>

    <main class="solution-main">
      <section class="solution-points" aria-label="So funktioniert die Lösung">
        <article class="solution-point">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M9 17a16 16 0 0 1 27-5l3 3m0-8v8h-8M39 31a16 16 0 0 1-27 5l-3-3m0 8v-8h8" />
          </svg>
          <p>Bekannte Mechanik</p>
        </article>

        <article class="solution-point">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M24 10c-2-4-8-5-12-2-3 2-4 7-2 10-4 2-5 8-1 11-1 5 3 9 8 9h7V10Zm0 0c2-4 8-5 12-2 3 2 4 7 2 10 4 2 5 8 1 11 1 5-3 9-8 9h-7" />
            <path d="M16 14c3 0 5 2 5 5m-10 0c3 0 5 2 5 5m-2 6c3-1 5 0 6 3m12-19c-3 0-5 2-5 5m10 0c-3 0-5 2-5 5m2 6c-3-1-5 0-6 3M24 10v28" />
          </svg>
          <p>Dazwischen <strong>Microlearnings</strong></p>
        </article>

        <article class="solution-point">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M8 12h20v27H8zM14 19h8m-8 6h8m-8 6h5" />
            <path d="m32 14 2.5 5.5L40 22l-5.5 2.5L32 30l-2.5-5.5L24 22l5.5-2.5L32 14Zm8 17 1.5 3.5L45 36l-3.5 1.5L40 41l-1.5-3.5L35 36l3.5-1.5L40 31Z" />
          </svg>
          <p>Gewohnte Tätigkeit wird mit wertvollem Wissen aufgewertet</p>
        </article>
      </section>

      <video
        class="solution-video"
        src="/assets/Demo.mp4"
        autoplay
        controls
        muted
        playsinline
        preload="metadata"
        aria-label="Produktdemo"
      />
    </main>
  </div>
</template>

<style scoped>
.solution-slide {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: clamp(22px, 4vh, 38px);
  width: 100%;
  height: 100%;
  padding: clamp(30px, 5vh, 54px) clamp(36px, 7vw, 92px);
  overflow: hidden;
  background: radial-gradient(ellipse at 84% 55%, #eaf5f0 0, #f8faf8 43%, #fff 76%);
  color: #17231f;
  font-family: 'Manrope', 'Segoe UI', sans-serif;
}

.solution-slide * {
  box-sizing: border-box;
}

.solution-heading {
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
}

.solution-heading h1 {
  margin: 0;
  color: #17231f;
  font-size: clamp(30px, 3.8vw, 48px);
  font-weight: 800;
  letter-spacing: -.065em;
  line-height: 1.08;
}

.solution-main {
  display: grid;
  grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
  align-items: center;
  gap: clamp(28px, 5vw, 68px);
  width: 100%;
  max-width: 1100px;
  min-height: 0;
  margin: 0 auto;
}

.solution-points {
  display: flex;
  flex-direction: column;
  gap: clamp(20px, 3.5vh, 34px);
}

.solution-point {
  display: flex;
  align-items: center;
  gap: clamp(14px, 2vw, 22px);
}

.solution-point svg {
  flex: 0 0 clamp(42px, 5vw, 58px);
  width: clamp(42px, 5vw, 58px);
  height: clamp(42px, 5vw, 58px);
  fill: none;
  stroke: #218768;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.4;
}

.solution-point p {
  margin: 0;
  color: #17231f;
  font-size: clamp(18px, 2vw, 25px);
  font-weight: 700;
  letter-spacing: -.035em;
  line-height: 1.25;
}

.solution-point strong {
  color: #218768;
  font-weight: 800;
}

.solution-video {
  display: block;
  width: auto;
  max-width: 100%;
  height: min(62vh, 440px);
  aspect-ratio: 9 / 16;
  justify-self: center;
  border: 1px solid rgb(23 35 31 / 12%);
  border-radius: 18px;
  background: #101613;
  box-shadow: 0 18px 48px rgb(24 60 45 / 14%);
  object-fit: cover;
}

@media (max-width: 700px) {
  .solution-slide {
    padding-right: 28px;
    padding-left: 28px;
  }

  .solution-main {
    grid-template-columns: minmax(0, 1fr);
    align-content: center;
    gap: 22px;
  }

  .solution-points {
    gap: 14px;
  }

  .solution-point svg {
    flex-basis: 38px;
    width: 38px;
    height: 38px;
  }

  .solution-point p {
    font-size: clamp(16px, 3.4vw, 20px);
  }

  .solution-video {
    height: 38vh;
  }
}
</style>
