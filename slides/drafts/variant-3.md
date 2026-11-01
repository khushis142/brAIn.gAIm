---
# Konzept: Feed-Glitch / Scroll-Intervention
theme: default
layout: none
class: feed-glitch-opener
title: brAIn.gAIn — Feed-Glitch
---

<div class="feed-glitch-opener">
<div class="glitch-stage">
  <div class="feed-stream" aria-hidden="true">
    <div class="feed-card card-a"><i></i><b></b><em></em></div>
    <div class="feed-card card-b"><i></i><b></b><em></em></div>
    <div class="feed-card card-c"><i></i><b></b><em></em></div>
    <div class="feed-card card-d"><i></i><b></b><em></em></div>
    <div class="feed-card card-e"><i></i><b></b><em></em></div>
  </div>
  </div>
  <div class="scanline" aria-hidden="true"></div>
  <div class="intervention" aria-hidden="true"></div>
  <h1>Hand aufs Herz...</h1>
</div>

<style>
.feed-glitch-opener {
  background: #080b10;
  color: #f6f7f4;
  font-family: 'Manrope', sans-serif;
  overflow: hidden;
}
.feed-glitch-opener .glitch-stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 51% 51%, #18211f 0, #0b0e12 47%, #080b10 76%);
}
.feed-glitch-opener .feed-stream {
  position: absolute;
  inset: -20% -15%;
  display: flex;
  justify-content: center;
  gap: 2.2rem;
  transform: rotate(-9deg) scale(1.08);
  filter: blur(2px);
  opacity: .53;
}
.feed-glitch-opener .feed-card {
  flex: 0 0 17vw;
  min-width: 185px;
  height: 150%;
  border: 1px solid #ffffff18;
  border-radius: 28px;
  background: linear-gradient(160deg, #182026, #11171b 45%, #1d2925);
  box-shadow: 0 18px 80px #0008;
}
.feed-glitch-opener .feed-card i,
.feed-glitch-opener .feed-card b,
.feed-glitch-opener .feed-card em {
  display: block;
  margin: 1.2rem;
  border-radius: 18px;
  background: linear-gradient(135deg, #26363a, #1a2428 48%, #253c34);
}
.feed-glitch-opener .feed-card i { height: 33%; }
.feed-glitch-opener .feed-card b { height: 21%; background: linear-gradient(135deg, #24332f, #17201e); }
.feed-glitch-opener .feed-card em { height: 26%; background: linear-gradient(135deg, #202b35, #19221f 55%, #26332d); }
.feed-glitch-opener .card-b { transform: translateY(8%); }
.feed-glitch-opener .card-c { transform: translateY(-4%); }
.feed-glitch-opener .card-d { transform: translateY(11%); }
.feed-glitch-opener .scanline {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(0deg, transparent 0 5px, #ffffff08 6px, transparent 7px);
  opacity: .42;
}
.feed-glitch-opener .intervention {
  position: absolute;
  left: -8%;
  right: -8%;
  top: 48%;
  height: 9rem;
  transform: rotate(-3deg);
  background: #35B48D;
  box-shadow: 0 0 90px #35B48D66;
  clip-path: polygon(0 10%, 23% 0, 48% 12%, 72% 0, 100% 9%, 98% 91%, 69% 100%, 43% 88%, 18% 100%, 0 87%);
}
.feed-glitch-opener h1 {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  color: #f9fbf8;
  font-size: clamp(3.5rem, 9vw, 8rem);
  font-weight: 800;
  letter-spacing: -.075em;
  text-shadow: 0 4px 30px #0009;
}
</style>

<!--
Wer von euch hat sich schon mal völlig in Social Media verloren?

Wer hat diese Woche schon gefühlt 2 Stunden (oder mehr) auf TikTok verbracht?

Und wer hätte diese Zeit rückblickend lieber mit wichtigeren Dingen – wie dem Lernen für eine Klausur – verbracht?
-->

---
# Konzept: Feed-Glitch / Scroll-Intervention
theme: default
layout: none
class: feed-glitch-study
title: brAIn.gAIn — Der Feed wird unterbrochen
---

<div class="feed-glitch-study">
<div class="study-scene">
  <div class="study-heading">
    <span>JUGENDLICHE · 10–17 JAHRE</span>
    <div class="heading-rule"></div>
  </div>
  </div>

  <div class="phone-feed" aria-hidden="true">
    <div class="phone-top"><i></i><b></b><i></i></div>
    <div class="ghost-post post-one"><i></i><b></b><em></em></div>
    <div class="ghost-post post-two"><i></i><b></b><em></em></div>
    <div class="ghost-post post-three"><i></i><b></b><em></em></div>
    <div class="interruption"></div>
  </div>

  <div class="hero-finding">
    <div class="hero-number">2,5</div>
    <div class="hero-unit">Stunden</div>
    <div class="hero-caption">täglich auf Social Media</div>
  </div>

  <div class="side-facts">
    <div class="fact-count">
      <strong>1,5 Mio.+</strong>
      <span>junge Menschen mit suchtartigem Nutzungsverhalten</span>
    </div>
    <div class="fact-scroll">
      <strong>Doomscrolling</strong>
      <span>frisst Zeit und Energie</span>
    </div>
  </div>

  <div class="study-takeaway">
    <span>Und es betrifft nicht nur Jugendliche.</span>
    Auch im Studium und Beruf kennen wir das Problem.
  </div>

  <div class="study-source">
    Quelle: Wiedemann, H., Busch, K., Schlichter, N., Gebhardt, L., Paschke, K.* (2026).<br>
    Problematische Mediennutzung bei Kindern und Jugendlichen in Deutschland: Ergebnisbericht 2025/2026.<br>
    DAK-Gesundheit. www.dak.de/mediensucht
  </div>
</div>

<style>
.feed-glitch-study {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #f4f8f5;
  color: #17231f;
  font-family: 'Manrope', sans-serif;
}

.feed-glitch-study .study-scene {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  overflow: hidden;
  padding: 3.5% 4.2% 2.5%;
  background:
    radial-gradient(ellipse at 50% 40%, rgb(53 180 141 / 12%), transparent 42%),
    #f4f8f5;
}

.feed-glitch-study .study-heading {
  position: relative;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 1rem;
  color: #52615b;
  font-size: .78rem;
  font-weight: 800;
  letter-spacing: .18em;
}

.feed-glitch-study .heading-rule {
  height: 1px;
  flex: 1;
  background: rgb(53 180 141 / 55%);
}

.feed-glitch-study .phone-feed {
  position: absolute;
  top: 12%;
  left: 34%;
  box-sizing: border-box;
  width: 32%;
  height: 75%;
  overflow: hidden;
  border: 8px solid #ffffff;
  border-radius: 2.5rem;
  background: linear-gradient(160deg, #17231f, #101916 68%, #20352b);
  box-shadow: 0 1.5rem 3.5rem rgb(23 35 31 / 22%), inset 0 0 2rem rgb(255 255 255 / 4%);
}

.feed-glitch-study .phone-top {
  box-sizing: border-box;
  height: 2.4rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 .9rem;
  border-bottom: 1px solid rgb(255 255 255 / 12%);
}

.feed-glitch-study .phone-top i,
.feed-glitch-study .phone-top b {
  display: block;
  border-radius: 999px;
  background: rgb(190 215 203 / 35%);
}

.feed-glitch-study .phone-top i { width: .55rem; height: .55rem; }
.feed-glitch-study .phone-top b { width: 2.2rem; height: .25rem; }

.feed-glitch-study .ghost-post {
  box-sizing: border-box;
  height: 28%;
  margin: .8rem;
  padding: .7rem;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 1rem;
  background: rgb(255 255 255 / 5%);
}

.feed-glitch-study .ghost-post i,
.feed-glitch-study .ghost-post b,
.feed-glitch-study .ghost-post em {
  display: block;
  max-width: 100%;
  border-radius: .8rem;
  background: linear-gradient(135deg, #30483d, #1b2928 60%, #31483c);
}

.feed-glitch-study .ghost-post i { height: 68%; }

.feed-glitch-study .ghost-post b { width: 55%; height: .35rem; margin-top: .55rem; opacity: .6; }
.feed-glitch-study .ghost-post em { width: 37%; height: .3rem; margin-top: .35rem; opacity: .35; }
.feed-glitch-study .post-two { transform: translateX(6%); }
.feed-glitch-study .post-three { transform: translateX(-4%); }

.feed-glitch-study .interruption {
  position: absolute;
  top: 38%;
  left: -8%;
  width: 116%;
  height: 27%;
  border-top: 2px solid #8fe3c5;
  border-bottom: 2px solid #8fe3c5;
  background: #35B48D;
  box-shadow: 0 0 3rem rgb(53 180 141 / 38%);
}

.feed-glitch-study .hero-finding {
  position: absolute;
  z-index: 3;
  top: 28%;
  left: 35.5%;
  box-sizing: border-box;
  width: 29%;
  text-align: center;
  text-shadow: 0 .3rem 1.4rem rgb(0 0 0 / 35%);
}

.feed-glitch-study .hero-number {
  color: #fff;
  font-size: clamp(4rem, 9vw, 8rem);
  font-weight: 800;
  letter-spacing: -.1em;
  line-height: .9;
}

.feed-glitch-study .hero-unit {
  margin-top: .45rem;
  color: #e9fff5;
  font-size: clamp(1.45rem, 2.7vw, 2.7rem);
  font-weight: 800;
  letter-spacing: -.06em;
}

.feed-glitch-study .hero-caption {
  margin: .25rem auto 0;
  max-width: 95%;
  color: #d9f5e9;
  font-size: clamp(.78rem, 1.15vw, 1rem);
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.feed-glitch-study .side-facts {
  position: absolute;
  z-index: 4;
  top: 19%;
  right: 4.2%;
  box-sizing: border-box;
  width: 24%;
  max-width: 24%;
}

.feed-glitch-study .fact-count,
.feed-glitch-study .fact-scroll {
  box-sizing: border-box;
  max-width: 100%;
  padding: 1rem 1rem 1.1rem;
  border: 1px solid rgb(53 180 141 / 26%);
  border-left: 4px solid #35B48D;
  border-radius: .8rem;
  background: #ffffff;
  box-shadow: 0 .5rem 1.5rem rgb(23 35 31 / 7%);
  overflow-wrap: anywhere;
}

.feed-glitch-study .fact-count strong,
.feed-glitch-study .fact-scroll strong {
  display: block;
  max-width: 100%;
  color: #218768;
  font-size: clamp(1.15rem, 1.85vw, 1.8rem);
  font-weight: 800;
  letter-spacing: -.055em;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.feed-glitch-study .fact-count span,
.feed-glitch-study .fact-scroll span {
  display: block;
  max-width: 100%;
  margin-top: .35rem;
  color: #52615b;
  font-size: clamp(.72rem, .95vw, .9rem);
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.feed-glitch-study .fact-scroll { margin-top: .75rem; }

.feed-glitch-study .fact-scroll strong {
  color: #17231f;
  font-size: clamp(1rem, 1.45vw, 1.4rem);
}

.feed-glitch-study .study-takeaway {
  position: absolute;
  z-index: 4;
  left: 4.2%;
  bottom: 15%;
  box-sizing: border-box;
  width: 25%;
  max-width: 25%;
  padding: .9rem 1rem;
  border-left: 4px solid #35B48D;
  border-radius: 0 .8rem .8rem 0;
  background: #ffffff;
  color: #52615b;
  font-size: clamp(.8rem, 1.15vw, 1.05rem);
  line-height: 1.4;
  box-shadow: 0 .5rem 1.5rem rgb(23 35 31 / 7%);
  overflow-wrap: anywhere;
}

.feed-glitch-study .study-takeaway span {
  display: block;
  margin-bottom: .35rem;
  color: #218768;
  font-weight: 800;
}

.feed-glitch-study .study-source {
  position: absolute;
  z-index: 4;
  left: 4.2%;
  right: 4.2%;
  bottom: 3%;
  box-sizing: border-box;
  color: #68756f;
  font-size: clamp(.5rem, .68vw, .62rem);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

@media (max-width: 900px) {
  .feed-glitch-study .phone-feed {
    left: 27%;
    width: 40%;
  }

  .feed-glitch-study .hero-finding {
    left: 28%;
    width: 38%;
  }

  .feed-glitch-study .side-facts {
    right: 3%;
    width: 26%;
    max-width: 26%;
  }

  .feed-glitch-study .study-takeaway {
    left: 3%;
    width: 24%;
    max-width: 24%;
  }
}
</style>
