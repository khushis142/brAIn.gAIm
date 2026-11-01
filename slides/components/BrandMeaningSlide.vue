<template>
  <div class="brand-meaning-slide">
    <header>
      <span class="eyebrow">WOFÜR WIR STEHEN</span>
      <h1>Von Brainrot zu braingain</h1>
    </header>

    <main>
      <img class="brand-logo" src="/assets/brAIngAIm.webp" alt="brAIn.gAIn" />
    </main>
  </div>
</template>

<style scoped>
.brand-meaning-slide {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: clamp(16px, 3vh, 28px);
  width: 100%;
  height: 100%;
  padding: clamp(24px, 4.5vh, 46px) clamp(32px, 7vw, 92px);
  overflow: hidden;
  background: radial-gradient(ellipse at 52% 55%, #e9f4ef 0, #f7f9f7 46%, #fff 80%);
  color: #17231f;
  font-family: 'Manrope', 'Segoe UI', sans-serif;
  text-align: center;
}

.brand-meaning-slide * {
  box-sizing: border-box;
}

header .eyebrow {
  color: #218768;
  font-size: clamp(9px, .9vw, 12px);
  font-weight: 800;
  letter-spacing: .16em;
}

header h1 {
  margin: 8px 0 0;
  color: #17231f;
  font-size: clamp(30px, 4.2vw, 52px);
  font-weight: 800;
  letter-spacing: -.065em;
  line-height: 1.08;
}

main {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 0;
  margin: 0 auto;
}

.brand-logo {
  position: relative;
  right: auto;
  bottom: auto;
  display: block;
  width: min(54vw, 680px);
  max-height: 70%;
  height: auto;
  justify-self: center;
  object-fit: contain;
}

@media (max-width: 700px) {
  .brand-meaning-slide {
    padding-right: 24px;
    padding-left: 24px;
  }

  .brand-logo {
    width: min(70vw, 320px);
  }
}
</style>
