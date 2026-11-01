---
theme: default
title: brAIn.gAIn — Problem & Studienbeleg
layout: none
class: paper-phone-study
drawings:
  persist: false
---

<div class="paper-scene">
<header class="paper-header">
<span class="paper-logo">brAIn.gAIn</span>
<span class="paper-section">PROBLEM <i></i> STUDIENBELEG</span>
</header>

<main class="paper-content">
<div class="evidence-layout">
<section class="time-finding">
<span class="finding-kicker">JUGENDLICHE · 10–17 JAHRE</span>
<div class="time-lockup"><span class="time-number">2,5</span><span class="time-unit">Stunden</span></div>
<p class="time-caption">täglich auf<br>Social Media</p>
<span class="finding-underline" aria-hidden="true"></span>
</section>

<div class="phone-art" aria-hidden="true">
<div class="paper-cutout"></div>
<div class="phone">
<div class="phone-screen">
<div class="phone-status"><span></span><span></span></div>
<div class="feed-label">SOCIAL FEED</div>
<div class="feed-image feed-image-one"><i></i><b></b></div>
<div class="feed-lines"><i></i><i></i></div>
<div class="feed-image feed-image-two"><i></i><b></b></div>
<div class="feed-lines short-lines"><i></i><i></i></div>
<div class="screen-glitch"></div>
</div>
<div class="phone-button"></div>
</div>
<span class="orbit-dot orbit-dot-one" aria-hidden="true"></span>
<span class="orbit-dot orbit-dot-two" aria-hidden="true"></span>
</div>

<aside class="evidence-notes">
<section class="evidence-note count-note">
<span class="note-index">01 / BEFUND</span>
<strong>1,5 Mio.+</strong>
<p>junge Menschen mit suchtartigem Nutzungsverhalten</p>
</section>
<section class="evidence-note scroll-note">
<span class="note-index">02 / FOLGE</span>
<strong>Doomscrolling</strong>
<p>frisst Zeit und Energie</p>
</section>
</aside>
</div>

<section class="relevance-note">
<span class="relevance-mark" aria-hidden="true"></span>
<p><strong>Und es betrifft nicht nur Jugendliche.</strong><br>Auch im Studium und Beruf kennen wir das Problem.</p>
</section>
</main>

<footer class="paper-source">Wiedemann, H., Busch, K., Schlichter, N., Gebhardt, L., Paschke, K.* (2026). Problematische Mediennutzung bei Kindern und Jugendlichen in Deutschland: Ergebnisbericht 2025/2026. DAK-Gesundheit. www.dak.de/mediensucht</footer>
</div>

<style>
.paper-phone-study {
  background: #fbfaf6;
  color: #17211e;
  font-family: 'Manrope', sans-serif;
  overflow: hidden;
}
.paper-phone-study .paper-scene {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: 42px minmax(0, 1fr) auto;
  gap: 12px;
  box-sizing: border-box;
  padding: 34px 54px 20px;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 50% 46%, #e5f5ef 0, #f4f8f3 20%, transparent 42%),
    #fbfaf6;
}
.paper-phone-study .paper-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  border-bottom: 1px solid #17211e22;
}
.paper-phone-study .paper-logo {
  color: #35B48D;
  font-size: clamp(1rem, 1.5vw, 1.3rem);
  font-weight: 800;
  letter-spacing: -.06em;
}
.paper-phone-study .paper-section {
  display: flex;
  align-items: center;
  gap: .65rem;
  color: #58645f;
  font-size: clamp(.58rem, .75vw, .72rem);
  font-weight: 800;
  letter-spacing: .16em;
  white-space: nowrap;
}
.paper-phone-study .paper-section i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #35B48D;
}
.paper-phone-study .paper-content {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 10px;
  min-height: 0;
  min-width: 0;
}
.paper-phone-study .evidence-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 250px) minmax(0, 1fr);
  align-items: center;
  gap: clamp(24px, 5vw, 76px);
  min-width: 0;
  min-height: 0;
}
.paper-phone-study .time-finding {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  min-width: 0;
  max-width: 390px;
  padding: 1rem 1.1rem 1.1rem;
  justify-self: end;
  background: #fffefa;
  box-shadow: 0 12px 28px #243a3012;
  clip-path: polygon(1% 0, 98% 1%, 100% 7%, 99% 100%, 2% 98%, 0 92%);
}
.paper-phone-study .finding-kicker,
.paper-phone-study .note-index {
  display: block;
  color: #61716a;
  font-size: clamp(.58rem, .78vw, .76rem);
  font-weight: 800;
  letter-spacing: .15em;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.paper-phone-study .time-lockup {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  column-gap: .38em;
  margin-top: .25rem;
  min-width: 0;
}
.paper-phone-study .time-number {
  color: #17211e;
  font-size: clamp(5rem, 11vw, 9.6rem);
  font-weight: 800;
  letter-spacing: -.105em;
  line-height: .95;
  overflow-wrap: anywhere;
}
.paper-phone-study .time-unit {
  color: #35B48D;
  font-size: clamp(1.25rem, 2.25vw, 2.2rem);
  font-weight: 800;
  letter-spacing: -.06em;
  overflow-wrap: anywhere;
}
.paper-phone-study .time-caption {
  max-width: 15ch;
  margin: .55rem 0 0;
  color: #26332e;
  font-size: clamp(1.05rem, 1.7vw, 1.55rem);
  font-weight: 700;
  line-height: 1.18;
  overflow-wrap: anywhere;
}
.paper-phone-study .finding-underline {
  display: block;
  width: min(100%, 170px);
  height: 7px;
  margin-top: 1.25rem;
  background: #35B48D;
  clip-path: polygon(0 18%, 100% 0, 96% 100%, 3% 80%);
}
.paper-phone-study .phone-art {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: min(100%, 430px);
  min-width: 0;
  min-height: 300px;
  justify-self: center;
}
.paper-phone-study .paper-cutout {
  position: absolute;
  inset: 3% -9%;
  background: #bfeada;
  clip-path: polygon(14% 1%, 88% 0, 100% 16%, 94% 83%, 84% 100%, 12% 96%, 0 82%, 5% 15%);
  transform: rotate(3deg);
}
.paper-phone-study .phone {
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: min(100%, 222px);
  height: 100%;
  max-height: 420px;
  min-height: 300px;
  padding: 11px;
  border: 1px solid #303c37;
  border-radius: 35px;
  background: #19231f;
  box-shadow: 0 22px 38px #243a3026, 8px 13px 0 #ffffffb8;
}
.paper-phone-study .phone-screen {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 18px 12px 12px;
  border-radius: 25px;
  background: #eef3ef;
}
.paper-phone-study .phone-status {
  display: flex;
  justify-content: space-between;
  margin: 0 3px 15px;
}
.paper-phone-study .phone-status span {
  width: 30px;
  height: 5px;
  border-radius: 6px;
  background: #9ca9a2;
}
.paper-phone-study .phone-status span:last-child { width: 18px; }
.paper-phone-study .feed-label {
  margin-bottom: 9px;
  color: #61716a;
  font-size: .58rem;
  font-weight: 800;
  letter-spacing: .18em;
}
.paper-phone-study .feed-image {
  position: relative;
  height: 29%;
  min-height: 74px;
  overflow: hidden;
  border-radius: 13px;
  background: linear-gradient(135deg, #b2ddd0, #83c4aa 50%, #d2e7d8);
}
.paper-phone-study .feed-image-one::before,
.paper-phone-study .feed-image-two::before {
  position: absolute;
  inset: 16% 12% 0;
  border-radius: 50% 50% 0 0;
  background: #35B48D;
  content: "";
}
.paper-phone-study .feed-image-one i,
.paper-phone-study .feed-image-two i {
  position: absolute;
  top: 18%;
  left: 23%;
  width: 20%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: #f3d6af;
}
.paper-phone-study .feed-image-one b,
.paper-phone-study .feed-image-two b {
  position: absolute;
  right: 13%;
  bottom: 15%;
  width: 24%;
  height: 34%;
  border-radius: 50% 50% 10% 10%;
  background: #f7f3e9;
}
.paper-phone-study .feed-image-two {
  height: 23%;
  background: linear-gradient(135deg, #e7d8bc, #d6b894 48%, #b9d3bf);
}
.paper-phone-study .feed-image-two::before {
  inset: 28% -3% -28%;
  background: #688d77;
}
.paper-phone-study .feed-image-two i {
  top: 12%;
  left: 65%;
  width: 13%;
  background: #f4e7c8;
}
.paper-phone-study .feed-image-two b {
  right: 62%;
  width: 18%;
  height: 43%;
  background: #e4a96f;
}
.paper-phone-study .feed-lines {
  display: grid;
  gap: 5px;
  padding: 9px 1px 12px;
}
.paper-phone-study .feed-lines i {
  display: block;
  width: 80%;
  height: 4px;
  border-radius: 5px;
  background: #aab6af;
}
.paper-phone-study .feed-lines i:last-child { width: 54%; }
.paper-phone-study .short-lines { padding-top: 7px; }
.paper-phone-study .screen-glitch {
  position: absolute;
  top: 48%;
  left: -8%;
  width: 116%;
  height: 15%;
  transform: rotate(-7deg);
  background: #35B48D;
  clip-path: polygon(0 12%, 34% 0, 63% 13%, 100% 1%, 98% 91%, 66% 100%, 36% 88%, 0 100%);
}
.paper-phone-study .phone-button {
  align-self: center;
  width: 34px;
  height: 4px;
  margin-top: 8px;
  border-radius: 6px;
  background: #78847e;
}
.paper-phone-study .orbit-dot {
  position: absolute;
  z-index: 2;
  width: 11px;
  height: 11px;
  border: 3px solid #fbfaf6;
  border-radius: 50%;
  background: #35B48D;
  box-shadow: 0 0 0 1px #35B48D;
}
.paper-phone-study .orbit-dot-one { top: 12%; right: 2%; }
.paper-phone-study .orbit-dot-two { bottom: 14%; left: 0; width: 7px; height: 7px; }
.paper-phone-study .evidence-notes {
  display: grid;
  gap: clamp(18px, 3.2vh, 30px);
  align-content: center;
  min-width: 0;
  max-width: 360px;
}
.paper-phone-study .evidence-note {
  box-sizing: border-box;
  min-width: 0;
  padding: .6rem 0 .7rem 1rem;
  border-left: 3px solid #35B48D;
  overflow-wrap: anywhere;
}
.paper-phone-study .count-note {
  background: linear-gradient(90deg, #e7f5ee 0, #e7f5eeaa 72%, transparent);
}
.paper-phone-study .evidence-note strong {
  display: block;
  max-width: 100%;
  margin-top: .35rem;
  color: #17211e;
  font-size: clamp(1.55rem, 2.5vw, 2.6rem);
  font-weight: 800;
  letter-spacing: -.065em;
  line-height: 1.05;
  overflow-wrap: anywhere;
}
.paper-phone-study .evidence-note p {
  max-width: 29ch;
  margin: .38rem 0 0;
  color: #4b5952;
  font-size: clamp(.8rem, 1.05vw, 1rem);
  font-weight: 600;
  line-height: 1.42;
  overflow-wrap: anywhere;
}
.paper-phone-study .scroll-note strong {
  color: #35B48D;
  font-size: clamp(1.2rem, 1.8vw, 1.75rem);
}
.paper-phone-study .relevance-note {
  display: flex;
  align-items: center;
  gap: 14px;
  box-sizing: border-box;
  min-width: 0;
  padding: 12px 18px;
  border-top: 1px solid #17211e24;
  border-bottom: 1px solid #17211e24;
  background: #fffefa;
  box-shadow: 0 7px 18px #243a3009;
}
.paper-phone-study .relevance-mark {
  flex: 0 0 7px;
  width: 7px;
  height: 38px;
  background: #35B48D;
  clip-path: polygon(14% 0, 100% 8%, 84% 100%, 0 90%);
}
.paper-phone-study .relevance-note p {
  min-width: 0;
  margin: 0;
  color: #34413b;
  font-size: clamp(.82rem, 1.18vw, 1.1rem);
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.paper-phone-study .relevance-note strong {
  color: #17211e;
  font-weight: 800;
}
.paper-phone-study .paper-source {
  box-sizing: border-box;
  max-width: 100%;
  padding: 7px 10px;
  border-left: 2px solid #35B48D;
  background: #f1f2ec;
  color: #69756f;
  font-size: clamp(.55rem, .7vw, .68rem);
  font-weight: 500;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
@media (max-width: 900px) {
  .paper-phone-study .paper-scene { padding-right: 34px; padding-left: 34px; }
  .paper-phone-study .evidence-layout {
    grid-template-columns: minmax(0, 1fr) minmax(155px, 210px) minmax(0, 1fr);
    gap: 22px;
  }
  .paper-phone-study .time-number { font-size: clamp(4.5rem, 10vw, 7rem); }
}
</style>
