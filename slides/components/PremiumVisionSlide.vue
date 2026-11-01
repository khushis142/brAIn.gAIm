<template>
  <div class="premium-slide">
    <header class="slide-heading">
      <span class="eyebrow">AUSBLICK · PREMIUM</span>
      <h1>Mehr Überblick für Eltern.</h1>
    </header>

    <main class="premium-cards">
      <article class="premium-card">
        <div class="premium-icon">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M24 5 39 11v11c0 10-6.4 16.7-15 21-8.6-4.3-15-11-15-21V11l15-6Z" />
            <circle cx="24" cy="18" r="4" />
            <path d="M16.5 31c1-4 3.5-6 7.5-6s6.5 2 7.5 6" />
          </svg>
        </div>
        <h2>Elternkontrolle</h2>
      </article>

      <article class="premium-card">
        <div class="premium-icon">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M8 40V24h9v16M20 40V12h9v28M32 40V19h9v21" />
            <path d="m8 17 12-8 10 4 11-8" />
          </svg>
        </div>
        <h2>Lernfortschritt</h2>
      </article>

      <article class="premium-card">
        <div class="premium-icon">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="25" r="17" />
            <path d="M24 15v11l8 5M17 4h14M24 4v4" />
          </svg>
        </div>
        <h2>Gesunde Grenzen</h2>
      </article>
    </main>
  </div>
</template>

<style scoped>
.premium-slide {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: clamp(20px, 3.4vh, 34px);
  width: 100%;
  height: 100%;
  padding: clamp(28px, 5vh, 54px) clamp(36px, 7vw, 92px);
  overflow: hidden;
  background: radial-gradient(ellipse at 50% 68%, #eaf5f0 0, #f8faf8 42%, #fff 76%);
  color: #17231f;
  font-family: 'Manrope', 'Segoe UI', sans-serif;
}

.premium-slide * {
  box-sizing: border-box;
}

.slide-heading {
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
}

.eyebrow {
  color: #218768;
  font-size: clamp(9px, .9vw, 12px);
  font-weight: 800;
  letter-spacing: .15em;
}

.slide-heading h1 {
  margin: 9px 0 0;
  color: #17231f;
  font-size: clamp(30px, 3.7vw, 48px);
  font-weight: 800;
  letter-spacing: -.065em;
  line-height: 1.08;
}

.premium-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
  gap: clamp(14px, 2.5vw, 32px);
  width: 100%;
  max-width: 1050px;
  min-height: 0;
  margin: 0 auto;
}

.premium-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(18px, 2.8vh, 27px);
  min-width: 0;
  min-height: clamp(210px, 36vh, 290px);
  padding: clamp(16px, 2.3vw, 28px);
  border: 1.5px solid #253d33;
  border-radius: 25px 18px 26px 19px / 18px 24px 17px 25px;
  background: #fffefa;
  box-shadow: 3px 4px 0 rgb(53 180 141 / 20%), 0 16px 42px rgb(24 60 45 / 8%);
  text-align: center;
}

.premium-card:nth-child(2) {
  transform: translateY(-10px) rotate(.5deg);
}

.premium-card:nth-child(1) {
  transform: rotate(-.7deg);
}

.premium-card:nth-child(3) {
  transform: rotate(.7deg);
}

.premium-icon {
  display: grid;
  place-items: center;
  width: clamp(70px, 8.4vw, 100px);
  height: clamp(70px, 8.4vw, 100px);
  border-radius: 50%;
  background: #e8f5ef;
  color: #218768;
}

.premium-card:nth-child(2) .premium-icon {
  background: #17231f;
  color: #75d5b2;
}

.premium-icon svg {
  width: 54%;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.2;
}

.premium-card h2 {
  margin: 0;
  color: #17231f;
  font-size: clamp(17px, 1.8vw, 24px);
  font-weight: 800;
  letter-spacing: -.055em;
  line-height: 1.12;
  overflow-wrap: anywhere;
}

@media (max-width: 650px) {
  .premium-slide {
    padding-right: 26px;
    padding-left: 26px;
  }

  .premium-cards {
    gap: 10px;
  }

  .premium-card {
    min-height: 190px;
    padding: 14px 8px;
  }

  .premium-card h2 {
    font-size: clamp(14px, 2vw, 18px);
  }
}

@media (max-height: 590px) {
  .premium-slide {
    gap: 16px;
    padding-top: 22px;
    padding-bottom: 22px;
  }

  .premium-card {
    min-height: 195px;
  }
}
</style>
