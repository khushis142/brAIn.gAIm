<script setup lang="ts">
defineProps<{
  slide: 'title' | 'tools' | 'usage' | 'limitations' | 'bad' | 'good'
}>()

const tools = [
  {
    name: 'GitHub Copilot',
    detail: 'CLI · GPT-5.6-Luna',
    logo: '/assets/tool-logos/github-copilot.svg',
    alt: 'GitHub Copilot Logo',
    className: 'copilot',
  },
  {
    name: 'Claude Code',
    detail: 'Anthropic',
    logo: '/assets/tool-logos/claude.svg',
    alt: 'Claude Logo',
    className: 'claude',
  },
  {
    name: 'OpenCode CLI',
    detail: 'Terminal-Agent',
    logo: '/assets/tool-logos/opencode.ico',
    alt: 'OpenCode Logo',
    className: 'opencode',
  },
  {
    name: 'Antigravity CLI',
    detail: 'agy CLI · Gemini',
    logo: '/assets/tool-logos/antigravity.ico',
    alt: 'Google Antigravity Logo',
    secondaryLogo: '/assets/tool-logos/gemini.svg',
    secondaryAlt: 'Google Gemini Logo',
    className: 'antigravity',
  },
]

const useCases = [
  {
    title: 'Boilerplate-Code',
    text: 'Die KI schreibt wiederkehrenden Setup- und Grundgerüst-Code.',
    symbol: '</>',
  },
  {
    title: 'Erklärungen',
    text: 'Erklärungen zu Code, Konzepten und Kommandozeilenbefehlen.',
    symbol: '?',
  },
  {
    title: 'Debugging',
    text: 'Fehlersuche und Lösungsvorschläge.',
    symbol: '!',
  },
  {
    title: 'Workflow-Automatisierung',
    text: 'Eine AGENTS.md dokumentiert Projekt und Run-Skripte. Per KI starten wir den Dev-Server oder deployen ein Spiel; sie führt das Skript samt Validierung aus und fängt Fehler ab.',
    symbol: '↻',
  },
  {
    title: 'Dokumentation',
    text: 'KI-generierte Code-Dokumentation nutzen wir später wieder als Kontext für bessere Antworten.',
    symbol: '≡',
  },
  {
    title: 'Ergebnisse hinterfragen',
    text: 'KI erzeugt teils Dateien über 1.000 Zeilen. Regelmäßiges Refactoring in kleinere Dateien hält den Code verständlich und erweiterbar.',
    symbol: '↗',
  },
]

const limitations = [
  {
    title: 'Komplexe Codebasen',
    text: 'Einige Modelle tun sich mit Codebasen schwer, die sich über viele Dateien, Technologien und Abhängigkeiten erstrecken.',
    symbol: '01',
  },
  {
    title: 'Fehler-Schleifen',
    text: 'Manche Modelle geraten in Schleifen, in denen jede Korrektur einen neuen Fehler erzeugt. Das ist beim Veröffentlichen der Spiele im Backend mehrfach passiert.',
    symbol: '02',
  },
  {
    title: 'Erfahrung bleibt wichtig',
    text: 'Gute Ergebnisse erfordern weiterhin einen erfahrenen Menschen, der das Problem präzise und in technischen Begriffen beschreiben kann.',
    symbol: '03',
  },
]
</script>

<template>
  <div class="reflection-slide">
    <header v-if="slide !== 'title'" class="reflection-header">
      <span class="eyebrow">KI-REFLEXION</span>
      <img class="reflection-logo" src="/assets/brAIngAIm.webp" alt="brAIn.gAIn" />
    </header>

    <section v-if="slide === 'title'" class="reflection-title">
      <img class="title-logo" src="/assets/brAIngAIm.webp" alt="brAIn.gAIn" />
      <span class="eyebrow">UNSER ARBEITSPROZESS</span>
      <h1>KI-Reflexion</h1>
      <p>Was uns geholfen hat – und wo die Grenzen liegen.</p>
      <span class="title-accent" aria-hidden="true"></span>
    </section>

    <main v-else-if="slide === 'tools'" class="reflection-content">
      <div class="section-heading">
        <span class="eyebrow">UNSER STACK</span>
        <h1>Unsere Tools</h1>
      </div>
      <div class="tool-grid">
        <article
          v-for="tool in tools"
          :key="tool.name"
          class="tool-card"
          :class="tool.className"
        >
          <div class="tool-mark" :class="{ 'tool-mark--dual': tool.secondaryLogo }">
            <img :src="tool.logo" :alt="tool.alt" />
            <img
              v-if="tool.secondaryLogo"
              class="secondary-tool-logo"
              :src="tool.secondaryLogo"
              :alt="tool.secondaryAlt"
            />
          </div>
          <div>
            <h2>{{ tool.name }}</h2>
            <p>{{ tool.detail }}</p>
          </div>
        </article>
      </div>
    </main>

    <main v-else-if="slide === 'usage'" class="reflection-content usage-content">
      <div class="section-heading">
        <span class="eyebrow">IM PROJEKTALLTAG</span>
        <h1>Wo wir KI benutzt haben</h1>
      </div>
      <div class="use-grid">
        <article v-for="item in useCases" :key="item.title" class="info-card">
          <span class="info-symbol" aria-hidden="true">{{ item.symbol }}</span>
          <h2>{{ item.title }}</h2>
        </article>
      </div>
    </main>

    <main v-else-if="slide === 'limitations'" class="reflection-content">
      <div class="section-heading">
        <span class="eyebrow">REALISTISCH BLEIBEN</span>
        <h1>Limitations</h1>
      </div>
      <div class="limitations-grid">
        <article v-for="item in limitations" :key="item.title" class="limitation-card">
          <span class="limitation-number">{{ item.symbol }}</span>
          <h2>{{ item.title }}</h2>
          <p>{{ item.text }}</p>
        </article>
      </div>
    </main>

    <main v-else class="reflection-content examples-content">
      <div class="section-heading">
        <span class="eyebrow">{{ slide === 'bad' ? 'WAS NICHT FUNKTIONIERT HAT' : 'WAS GUT FUNKTIONIERT HAT' }}</span>
        <h1>
          Beispiele für
          <span :class="slide === 'bad' ? 'output-bad' : 'output-good'">
            {{ slide === 'bad' ? 'schlechten' : 'guten' }}
          </span>
          Output
        </h1>
      </div>
      <div class="examples-grid" :class="{ 'examples-grid--single': slide === 'good' }">
        <article v-for="number in slide === 'bad' ? 2 : 1" :key="number" class="example-card">
          <img
            v-if="slide === 'bad'"
            class="example-image"
            :src="`/assets/examples/bad${number}.png`"
            :alt="`Schlechtes Output-Beispiel ${number}`"
          />
          <img
            v-else-if="number === 1"
            class="example-image"
            src="/assets/examples/good1.png"
            alt="Gutes Output-Beispiel 1"
          />
          <div v-else class="image-placeholder">
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <rect x="6" y="8" width="36" height="32" rx="5" />
              <circle cx="18" cy="20" r="3" />
              <path d="m9 36 10-10 7 7 5-5 8 8" />
            </svg>
            <span>Bild {{ number }} hier einsetzen</span>
          </div>
          <p>BEISPIEL {{ number }}</p>
        </article>
      </div>
    </main>
  </div>
</template>

<style scoped>
.reflection-slide {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  height: 100%;
  padding: clamp(26px, 4.4vh, 48px) clamp(32px, 6vw, 84px);
  overflow: hidden;
  background:
    radial-gradient(ellipse at 95% 2%, rgb(53 180 141 / 11%), transparent 35%),
    #fff;
  color: #17231f;
  font-family: 'Manrope', 'Segoe UI', sans-serif;
}

.reflection-slide *,
.reflection-slide *::before,
.reflection-slide *::after {
  box-sizing: border-box;
}

.reflection-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.eyebrow {
  color: #218768;
  font-size: clamp(10px, 1vw, 13px);
  font-weight: 800;
  letter-spacing: .16em;
}

.reflection-logo {
  width: clamp(78px, 8vw, 108px);
  max-height: 44px;
  object-fit: contain;
}

.reflection-content {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: clamp(22px, 4vh, 42px);
  min-height: 0;
  padding-top: clamp(22px, 4.6vh, 48px);
}

.section-heading h1,
.reflection-title h1 {
  margin: .45rem 0 0;
  color: #17231f;
  font-size: clamp(38px, 5vw, 64px);
  font-weight: 800;
  letter-spacing: -.065em;
  line-height: 1.02;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: center;
  gap: clamp(16px, 2.5vw, 30px);
}

.tool-card {
  display: flex;
  align-items: center;
  gap: clamp(18px, 2.7vw, 34px);
  min-height: clamp(140px, 19vh, 190px);
  padding: clamp(22px, 3vw, 38px);
  border: 1px solid #e3ece7;
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 16px 42px rgb(23 35 31 / 7%);
  animation: tool-card-enter 650ms ease-in-out both;
}

.tool-card:nth-child(2) { animation-delay: 90ms; }
.tool-card:nth-child(3) { animation-delay: 180ms; }
.tool-card:nth-child(4) { animation-delay: 270ms; }

@keyframes tool-card-enter {
  from { opacity: 0; transform: translateY(18px) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.tool-mark {
  display: grid;
  flex: 0 0 clamp(68px, 8vw, 96px);
  place-items: center;
  width: clamp(68px, 8vw, 96px);
  height: clamp(68px, 8vw, 96px);
  border-radius: 22px;
  background: #f2f7f4;
}

.tool-mark img {
  display: block;
  width: 54%;
  height: 54%;
  object-fit: contain;
}

.tool-mark--dual {
  gap: 5px;
  padding: 10px;
}

.tool-mark--dual img {
  width: 42%;
  height: 42%;
}

.tool-mark--dual .secondary-tool-logo {
  filter: invert(55%) sepia(16%) saturate(1443%) hue-rotate(104deg) brightness(94%) contrast(88%);
}

.tool-card.opencode .tool-mark,
.tool-card.antigravity .tool-mark {
  background: #f4f5f6;
}

.tool-card h2 {
  margin: 0;
  color: #17231f;
  font-size: clamp(20px, 2.1vw, 29px);
  font-weight: 800;
  letter-spacing: -.045em;
  line-height: 1.15;
}

.tool-card p {
  margin: .55rem 0 0;
  color: #218768;
  font-size: clamp(14px, 1.45vw, 19px);
  font-weight: 700;
}

.use-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: clamp(10px, 1.2vw, 16px);
  min-height: 0;
}

.usage-content {
  gap: clamp(14px, 2.5vh, 26px);
  padding-top: clamp(12px, 2vh, 22px);
}

.usage-content .section-heading h1 {
  font-size: clamp(34px, 4.5vw, 58px);
}

.info-card {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  padding: clamp(8px, .9vw, 12px) clamp(12px, 1.35vw, 18px);
  border: 1px solid #e5eee9;
  border-radius: 19px;
  background: #fbfdfc;
  box-shadow: 0 10px 28px rgb(23 35 31 / 5%);
}

.info-symbol {
  display: grid;
  flex: 0 0 38px;
  place-items: center;
  width: 38px;
  height: 38px;
  margin-right: clamp(12px, 1.6vw, 20px);
  border-radius: 12px;
  background: #e7f5ee;
  color: #218768;
  font-size: 16px;
  font-weight: 800;
}

.info-card h2 {
  margin: 0;
  color: #17231f;
  font-size: clamp(16px, 1.55vw, 21px);
  font-weight: 800;
  letter-spacing: -.035em;
  line-height: 1.2;
  text-align: center;
}

.limitation-card h2 {
  margin: 0 0 5px;
  color: #17231f;
  font-size: clamp(15px, 1.3vw, 18px);
  font-weight: 800;
  letter-spacing: -.035em;
  line-height: 1.2;
}

.limitation-card p {
  margin: 0;
  color: #52615b;
  font-size: clamp(11.5px, .82vw, 13px);
  font-weight: 500;
  line-height: 1.3;
}

.limitations-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: clamp(10px, 1.5vh, 16px);
  min-height: 0;
}

.limitation-card {
  display: grid;
  grid-template-columns: 48px minmax(210px, .48fr) minmax(0, 1fr);
  align-items: center;
  gap: clamp(16px, 2vw, 26px);
  min-width: 0;
  padding: clamp(12px, 1.5vw, 20px) clamp(18px, 2vw, 28px);
  border: 1px solid #e3ece7;
  border-radius: 20px;
  background: linear-gradient(150deg, #fbfdfc, #f0f8f4);
  box-shadow: 0 18px 46px rgb(23 35 31 / 7%);
}

.limitation-number {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  background: #35b48d;
  color: #fff;
  font-size: 15px;
  font-weight: 800;
}

.limitation-card h2 {
  margin: 0;
  font-size: clamp(18px, 1.65vw, 23px);
}

.limitation-card p {
  font-size: clamp(13px, 1vw, 15px);
  line-height: 1.4;
}

.examples-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: center;
  gap: clamp(20px, 3vw, 38px);
  min-height: 0;
}

.examples-grid--single {
  grid-template-columns: minmax(0, 1fr);
}

.examples-grid--single .example-card {
  width: min(100%, 860px);
  justify-self: center;
  padding: 10px;
}

.examples-content .section-heading h1 {
  font-size: clamp(32px, 4vw, 52px);
  white-space: nowrap;
}

.output-good { color: #218768; }
.output-bad { color: #cf4343; }

.example-card {
  min-width: 0;
  padding: clamp(14px, 1.8vw, 24px);
  border: 1px solid #e3ece7;
  border-radius: 22px;
  background: #fbfdfc;
  box-shadow: 0 14px 36px rgb(23 35 31 / 6%);
}

.example-image {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 8.7;
  border-radius: 15px;
  object-fit: contain;
  background: #f7faf8;
}

.examples-grid--single .example-image {
  height: auto;
  max-height: 42vh;
  aspect-ratio: auto;
}

.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  aspect-ratio: 16 / 8.7;
  border: 2px dashed #a9c8b9;
  border-radius: 15px;
  background:
    linear-gradient(135deg, rgb(53 180 141 / 4%) 25%, transparent 25%) 0 0 / 18px 18px,
    #f7faf8;
  color: #71837a;
}

.image-placeholder svg {
  width: clamp(34px, 4.2vw, 54px);
  height: clamp(34px, 4.2vw, 54px);
  fill: none;
  stroke: #79ad96;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.image-placeholder span {
  font-size: clamp(13px, 1.25vw, 17px);
  font-weight: 700;
}

.example-card > p {
  margin: 14px 0 0;
  color: #218768;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .14em;
}

.reflection-title {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  grid-row: 1 / -1;
  text-align: center;
}

.title-logo {
  width: clamp(125px, 15vw, 190px);
  max-height: 100px;
  margin-bottom: clamp(34px, 7vh, 72px);
  object-fit: contain;
}

.reflection-title h1 {
  margin-top: 18px;
  font-size: clamp(72px, 10vw, 130px);
}

.reflection-title p {
  margin: 20px 0 0;
  color: #52615b;
  font-size: clamp(18px, 2vw, 25px);
  font-weight: 600;
}

.title-accent {
  width: 70px;
  height: 6px;
  margin-top: 42px;
  border-radius: 99px;
  background: #35b48d;
}

@media (max-width: 760px) {
  .reflection-slide { padding-right: 24px; padding-left: 24px; }
  .tool-grid { gap: 12px; }
  .tool-card { gap: 14px; padding: 18px; }
  .use-grid { gap: 10px; }
  .info-card { padding: 12px; }
  .info-symbol { flex-basis: 30px; width: 30px; height: 30px; margin-right: 9px; }
}

@media (prefers-reduced-motion: reduce) {
  .tool-card { animation: none; }
}
</style>
