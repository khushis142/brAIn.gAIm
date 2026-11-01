<template>
  <div class="business-slide">
    <header class="slide-heading">
      <span class="eyebrow">MARKT & GESCHÄFTSMODELL</span>
      <h1>Lernen bleibt kostenlos.</h1>
      <p>Bildungspartner machen es möglich.</p>
    </header>

    <main class="model-flow">
      <section class="model-card user-card">
        <div class="icon-disc user-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48">
            <circle cx="24" cy="15" r="8" />
            <path d="M9 41c1.8-9 7.2-13 15-13s13.2 4 15 13" />
          </svg>
        </div>
        <span class="model-label">B2C · FÜR JUGENDLICHE</span>
        <strong>Kostenlos</strong>
      </section>

      <div class="model-connector" aria-hidden="true">
        <span></span>
        <svg viewBox="0 0 48 24">
          <path d="M2 12h40m-9-9 9 9-9 9" />
        </svg>
      </div>

      <section class="model-card partner-card">
        <div class="icon-disc partner-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48">
            <path d="M7 20 24 8l17 12v21H7V20Z" />
            <path d="M18 41V27h12v14M15 20h.1M24 20h.1M33 20h.1" />
          </svg>
        </div>
        <span class="model-label">B2B · BILDUNGSPARTNER</span>
        <strong>Gezielte Partnerschaften</strong>
      </section>
    </main>
  </div>
</template>

<style scoped>
.business-slide {
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

.business-slide * {
  box-sizing: border-box;
}

.slide-heading {
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
}

.eyebrow,
.model-label {
  color: #218768;
  font-size: clamp(9px, .9vw, 12px);
  font-weight: 800;
  letter-spacing: .15em;
}

.slide-heading h1 {
  margin: 9px 0 4px;
  color: #17231f;
  font-size: clamp(30px, 3.7vw, 48px);
  font-weight: 800;
  letter-spacing: -.065em;
  line-height: 1.08;
}

.slide-heading p {
  margin: 0;
  color: #52615b;
  font-size: clamp(15px, 1.45vw, 19px);
  font-weight: 600;
}

.model-flow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(58px, .28fr) minmax(0, 1fr);
  align-items: center;
  gap: clamp(12px, 2vw, 26px);
  width: 100%;
  max-width: 1010px;
  min-height: 0;
  margin: 0 auto;
}

.model-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(13px, 2vh, 20px);
  min-width: 0;
  min-height: clamp(220px, 39vh, 310px);
  padding: clamp(20px, 3vw, 38px);
  border: 1.5px solid #253d33;
  border-radius: 27px 20px 25px 19px / 19px 26px 18px 24px;
  background: #fffefa;
  text-align: center;
}

.user-card {
  box-shadow: 3px 4px 0 rgb(53 180 141 / 20%), 0 18px 44px rgb(24 60 45 / 8%);
  transform: rotate(-.7deg);
}

.partner-card {
  box-shadow: 3px 4px 0 rgb(23 35 31 / 10%), 0 18px 44px rgb(24 60 45 / 8%);
  transform: rotate(.6deg);
}

.icon-disc {
  display: grid;
  place-items: center;
  width: clamp(68px, 8vw, 96px);
  height: clamp(68px, 8vw, 96px);
  border-radius: 50%;
  background: #e8f5ef;
  color: #218768;
}

.partner-icon {
  background: #17231f;
  color: #75d5b2;
}

.icon-disc svg {
  width: 53%;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.3;
}

.model-label {
  font-size: clamp(8px, .8vw, 11px);
}

.model-card strong {
  max-width: 17ch;
  color: #17231f;
  font-size: clamp(22px, 2.6vw, 34px);
  font-weight: 800;
  letter-spacing: -.055em;
  line-height: 1.12;
  overflow-wrap: anywhere;
}

.model-connector {
  display: flex;
  align-items: center;
  color: #35b48d;
}

.model-connector span {
  flex: 1 1 auto;
  height: 1px;
  background: rgb(33 135 104 / 36%);
}

.model-connector svg {
  flex: 0 0 42px;
  width: 42px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.4;
}

@media (max-width: 650px) {
  .business-slide {
    padding-right: 26px;
    padding-left: 26px;
  }

  .model-flow {
    grid-template-columns: minmax(0, 1fr) 38px minmax(0, 1fr);
    gap: 8px;
  }

  .model-card {
    min-height: 205px;
    padding: 15px 10px;
  }

  .model-connector svg {
    flex-basis: 32px;
    width: 32px;
  }
}

@media (max-height: 590px) {
  .business-slide {
    gap: 16px;
    padding-top: 22px;
    padding-bottom: 22px;
  }

  .model-card {
    min-height: 210px;
  }
}
</style>
