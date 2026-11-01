---
theme: default
title: brAIn.gAIn — Center Stage
info: |
  Konzept: Center Stage — Smartphone als Datenanker
  Alternative: Helles Editorial-Layout mit umliegenden Faktenkarten
aspectRatio: 16/9
layout: none
class: evidence-phone-slide
drawings:
  persist: false
---

<div class="evidence-layout">
<header class="evidence-header">
<div class="wordmark">brAIn<span>.</span>gAIn</div>
<div class="header-label">PROBLEM <i></i> STUDIE 2025/26</div>
</header>

<main class="evidence-main">
<section class="fact-card count-card">
<div class="card-kicker"><span class="kicker-dot"></span> BETROFFEN</div>
<div class="count-value">1,5 Mio.+</div>
<p>junge Menschen mit suchtartigem Nutzungsverhalten</p>
<div class="card-index">01 <span></span></div>
</section>

<div class="phone-column">
<div class="phone-shell" aria-label="Smartphone mit Studienwert">
<div class="phone-screen">
<div class="screen-top"><span></span><i></i></div>
<div class="screen-label">TÄGLICHE NUTZUNG</div>
<div class="screen-measure">
<div class="screen-number">2,5</div>
<div class="screen-unit">Stunden</div>
<div class="screen-caption">auf Social Media</div>
</div>
<div class="screen-audience">JUGENDLICHE <b>10–17 JAHRE</b></div>
<div class="screen-foot">
<span></span><span></span><span></span><span></span><span></span><span></span><span></span>
</div>
</div>
</div>
</div>

<div class="fact-stack">
<section class="fact-card scroll-card">
<div class="card-kicker"><span class="kicker-dot"></span> DER FEED</div>
<h2>Doomscrolling</h2>
<p>frisst Zeit und Energie</p>
<div class="card-index">02 <span></span></div>
</section>
<section class="fact-card relevance-card">
<div class="card-kicker"><span class="kicker-dot"></span> AUCH RELEVANT</div>
<p>Das Thema betrifft auch <strong>Studium und Beruf.</strong></p>
<div class="card-index">03 <span></span></div>
</section>
</div>
</main>

<footer class="evidence-footer">
<div class="source-rule"></div>
<p>Quelle: Wiedemann, H., Busch, K., Schlichter, N., Gebhardt, L., Paschke, K.* (2026). Problematische Mediennutzung bei Kindern und Jugendlichen in Deutschland: Ergebnisbericht 2025/2026. DAK-Gesundheit. www.dak.de/mediensucht</p>
</footer>
</div>

<style>
.evidence-phone-slide {
  box-sizing: border-box;
  overflow: hidden;
  background: #f7f9f7;
  color: #17231f;
  font-family: 'Manrope', sans-serif;
}
.evidence-phone-slide *,
.evidence-phone-slide *::before,
.evidence-phone-slide *::after {
  box-sizing: border-box;
}
.evidence-layout {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: clamp(12px, 2vh, 22px);
  padding: clamp(18px, 3.3vh, 34px) clamp(24px, 4.7vw, 72px) clamp(14px, 2.2vh, 24px);
  overflow: hidden;
  background:
    radial-gradient(ellipse at 51% 48%, #e9f4ef 0, #f7f9f7 43%, #f7f9f7 75%);
}
.evidence-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
}
.wordmark {
  color: #17231f;
  font-size: clamp(17px, 1.7vw, 24px);
  font-weight: 800;
  letter-spacing: -.065em;
  white-space: nowrap;
}
.wordmark span { color: #35b48d; }
.header-label {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #64736d;
  font-size: clamp(9px, .9vw, 12px);
  font-weight: 800;
  letter-spacing: .14em;
  text-align: right;
}
.header-label i {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 50%;
  background: #35b48d;
}
.evidence-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(168px, 220px) minmax(0, 1fr);
  align-items: center;
  gap: clamp(18px, 3.1vw, 44px);
  width: 100%;
  max-width: 1110px;
  min-height: 0;
  margin: 0 auto;
}
.fact-card {
  position: relative;
  width: 100%;
  max-width: 360px;
  min-width: 0;
  padding: clamp(18px, 2.2vw, 30px);
  border: 1px solid #e2eae6;
  border-radius: clamp(18px, 2vw, 27px);
  background: #fff;
  box-shadow: 0 16px 42px #183c2d0b;
  overflow-wrap: anywhere;
}
.count-card { justify-self: end; }
.card-kicker {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #728079;
  font-size: clamp(9px, .88vw, 12px);
  font-weight: 800;
  letter-spacing: .13em;
}
.kicker-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 50%;
  background: #35b48d;
}
.count-value {
  margin: clamp(20px, 3vh, 34px) 0 9px;
  color: #35a981;
  font-size: clamp(37px, 4.25vw, 58px);
  font-weight: 800;
  letter-spacing: -.085em;
  line-height: .98;
}
.fact-card p {
  max-width: 29ch;
  margin: 0;
  color: #43514b;
  font-size: clamp(14px, 1.35vw, 18px);
  font-weight: 500;
  line-height: 1.48;
}
.card-index {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: clamp(20px, 3vh, 32px);
  color: #a1ada7;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .12em;
}
.card-index span {
  width: 30px;
  height: 2px;
  border-radius: 9px;
  background: #35b48d;
}
.phone-column {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.phone-shell {
  display: flex;
  width: clamp(168px, 18vw, 244px);
  max-width: 100%;
  max-height: 100%;
  aspect-ratio: 9 / 18.2;
  padding: 7px;
  border: 1px solid #39443f;
  border-radius: clamp(29px, 3.4vw, 42px);
  background: #17211d;
  box-shadow: 0 30px 68px #1b352a30, 0 8px 20px #1b352a18;
}
.phone-screen {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0;
  min-height: 0;
  padding: clamp(13px, 1.8vw, 20px) clamp(12px, 1.5vw, 18px);
  border-radius: clamp(23px, 2.9vw, 34px);
  background:
    radial-gradient(circle at 80% 15%, #273b32 0, #19241f 34%, #101714 100%);
  color: #f5faf7;
  overflow: hidden;
}
.screen-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0 3px;
}
.screen-top span {
  width: 30px;
  height: 5px;
  border-radius: 9px;
  background: #718078;
}
.screen-top i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #35b48d;
}
.screen-label {
  margin-top: clamp(18px, 3vh, 30px);
  color: #aebdb5;
  font-size: clamp(8px, .8vw, 10px);
  font-weight: 800;
  letter-spacing: .13em;
  overflow-wrap: anywhere;
}
.screen-measure {
  margin: auto 0;
  padding: clamp(16px, 2.2vh, 24px) 0;
}
.screen-number {
  color: #65d0a8;
  font-size: clamp(56px, 7.3vw, 94px);
  font-weight: 800;
  letter-spacing: -.095em;
  line-height: .9;
}
.screen-unit {
  margin-top: 9px;
  font-size: clamp(18px, 2.1vw, 28px);
  font-weight: 800;
  letter-spacing: -.045em;
}
.screen-caption {
  max-width: 16ch;
  margin-top: 7px;
  color: #b9c5bf;
  font-size: clamp(11px, 1.05vw, 14px);
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.screen-audience {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 5px 8px;
  padding-top: 12px;
  border-top: 1px solid #ffffff20;
  color: #aebdb5;
  font-size: clamp(8px, .77vw, 10px);
  font-weight: 800;
  letter-spacing: .08em;
}
.screen-audience b {
  color: #f5faf7;
  font-weight: 800;
}
.screen-foot {
  display: flex;
  align-items: end;
  gap: 5px;
  height: clamp(25px, 4vh, 38px);
  margin-top: clamp(12px, 2vh, 20px);
  padding: 0 1px;
}
.screen-foot span {
  flex: 1 1 0;
  min-width: 0;
  border-radius: 5px 5px 2px 2px;
  background: #35b48d;
  opacity: .34;
}
.screen-foot span:nth-child(1) { height: 35%; }
.screen-foot span:nth-child(2) { height: 55%; }
.screen-foot span:nth-child(3) { height: 42%; }
.screen-foot span:nth-child(4) { height: 78%; opacity: .9; }
.screen-foot span:nth-child(5) { height: 48%; }
.screen-foot span:nth-child(6) { height: 67%; }
.screen-foot span:nth-child(7) { height: 40%; }
.fact-stack {
  display: flex;
  flex-direction: column;
  align-items: start;
  justify-content: center;
  gap: clamp(14px, 2.2vh, 22px);
  min-width: 0;
}
.scroll-card h2 {
  margin: clamp(15px, 2.2vh, 23px) 0 5px;
  color: #17231f;
  font-size: clamp(20px, 2.15vw, 29px);
  font-weight: 800;
  letter-spacing: -.06em;
  line-height: 1.1;
  overflow-wrap: anywhere;
}
.scroll-card p { color: #35a981; font-weight: 700; }
.relevance-card p { margin-top: clamp(15px, 2vh, 22px); }
.relevance-card strong { color: #17231f; font-weight: 800; }
.evidence-footer {
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
}
.source-rule {
  width: 100%;
  height: 1px;
  margin-bottom: 9px;
  background: #dce5e0;
}
.evidence-footer p {
  max-width: 100%;
  margin: 0;
  color: #748079;
  font-size: clamp(9px, .87vw, 12px);
  font-weight: 500;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
@media (max-width: 760px) {
  .evidence-layout {
    gap: 12px;
    padding-right: 26px;
    padding-left: 26px;
  }
  .evidence-main {
    grid-template-columns: minmax(0, 1fr) minmax(148px, 185px) minmax(0, 1fr);
    gap: 12px;
  }
  .fact-card { padding: 15px; }
  .count-value { font-size: clamp(34px, 5.2vw, 44px); }
  .fact-card p { font-size: clamp(12px, 1.65vw, 15px); }
  .phone-shell { width: clamp(148px, 22vw, 185px); }
}
@media (max-height: 590px) {
  .evidence-layout {
    gap: 10px;
    padding-top: 16px;
    padding-bottom: 12px;
  }
  .evidence-main { gap: clamp(12px, 2vw, 28px); }
  .count-value { margin-top: 16px; }
  .card-index { margin-top: 16px; }
  .screen-label { margin-top: 12px; }
  .screen-foot { height: 22px; margin-top: 10px; }
  .source-rule { margin-bottom: 6px; }
}
</style>
