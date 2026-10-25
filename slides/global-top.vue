<template></template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');

:root {
  --slidev-theme-primary: #35b48d;
  --brand-green: #35b48d;
  --brand-green-dark: #218768;
  --brand-ink: #17231f;
  --brand-muted: #52615b;
  font-family: 'Manrope', 'Segoe UI', sans-serif;
  font-synthesis: none;
}

.slidev-layout {
  background:
    radial-gradient(ellipse at 100% 0%, rgb(53 180 141 / 8%), transparent 34%),
    #ffffff;
  color: var(--brand-ink);
  font-family: 'Manrope', 'Segoe UI', sans-serif;
  font-weight: 500;
  letter-spacing: -0.015em;
}

.slidev-layout h1,
.slidev-layout h2,
.slidev-layout h3 {
  color: var(--brand-ink);
  font-family: 'Manrope', 'Segoe UI', sans-serif;
  font-weight: 800;
  letter-spacing: -0.045em;
}

.slidev-layout h1 {
  margin-bottom: 1.2rem;
  font-size: 2.65rem;
  line-height: 1.08;
}

.slidev-layout h1::after {
  display: block;
  width: 3.25rem;
  height: 0.28rem;
  margin-top: 0.85rem;
  border-radius: 999px;
  background: var(--brand-green);
  content: '';
}

.slidev-layout p {
  color: var(--brand-muted);
  line-height: 1.55;
}

.slidev-layout ul,
.slidev-layout ol {
  margin-top: 1.25rem;
  color: var(--brand-ink);
  font-size: 1.12rem;
  line-height: 1.6;
}

.slidev-layout li {
  padding-left: 0.2rem;
  margin-bottom: 0.65rem;
}

.slidev-layout li::marker {
  color: var(--brand-green);
  font-weight: 800;
}

.slidev-layout strong {
  color: var(--brand-green-dark);
  font-weight: 800;
}

.study-slide {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 1rem 1.5rem;
  align-items: stretch;
}

.study-hero {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 15rem;
  padding: 1.7rem 2rem;
  border-radius: 1.25rem;
  background:
    radial-gradient(circle at 100% 0%, rgb(255 255 255 / 18%), transparent 45%),
    var(--brand-green);
  color: #ffffff;
  box-shadow: 0 1rem 2rem rgb(33 135 104 / 18%);
}

.study-label {
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  opacity: 0.9;
}

.study-stat {
  margin-top: 0.65rem;
  font-size: 5.3rem;
  font-weight: 800;
  letter-spacing: -0.08em;
  line-height: 0.98;
}

.study-stat span {
  display: block;
  font-size: 2.1rem;
  letter-spacing: -0.04em;
}

.study-description {
  margin-top: 0.85rem;
  font-size: 1.2rem;
  font-weight: 700;
}

.study-facts {
  display: grid;
  gap: 1rem;
}

.study-fact {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 1.15rem 1.4rem;
  border: 1px solid rgb(53 180 141 / 20%);
  border-radius: 1.1rem;
  background: #f2faf6;
}

.study-fact-secondary {
  background: #f7f8f7;
}

.study-fact-number {
  color: var(--brand-green-dark);
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.05em;
  line-height: 1.1;
}

.study-fact-copy {
  margin-top: 0.45rem;
  color: var(--brand-muted);
  font-size: 0.95rem;
  line-height: 1.35;
}

.study-takeaway {
  grid-column: 1 / -1;
  padding: 0.9rem 1.2rem;
  border-left: 0.3rem solid var(--brand-green);
  border-radius: 0 0.8rem 0.8rem 0;
  background: #f2faf6;
  color: var(--brand-ink);
  font-size: 1.05rem;
}

.study-takeaway span {
  margin-right: 0.35rem;
  color: var(--brand-green-dark);
  font-weight: 800;
}

.study-source {
  grid-column: 1 / -1;
  color: #717b76;
  font-size: 0.57rem;
  line-height: 1.35;
}

.title-slide {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 2rem;
  background: radial-gradient(ellipse at 51% 51%, #e9f4ef 0, #f7f9f7 46%, #fff 80%);
}

.brand-logo {
  position: relative;
  right: auto;
  bottom: auto;
  width: clamp(125px, 15vw, 190px);
  max-height: 100px;
  margin-bottom: clamp(34px, 7vh, 72px);
  object-fit: contain;
}

.title-eyebrow {
  color: var(--brand-green-dark);
  font-size: clamp(10px, 1vw, 13px);
  font-weight: 800;
  letter-spacing: .16em;
}

.title-slide h1 {
  margin: 18px 0 0;
  color: #000000;
  font-size: clamp(4.5rem, 10vw, 8.2rem);
  font-weight: 800;
  letter-spacing: -.065em;
  line-height: 1;
  text-align: center;
}

.title-slide h1::after {
  display: none;
}

.title-slide p {
  margin: 20px 0 0;
  color: var(--brand-muted);
  font-size: clamp(1rem, 2vw, 1.5rem);
  font-weight: 600;
}

.title-accent {
  width: 70px;
  height: 6px;
  margin-top: 42px;
  border-radius: 99px;
  background: var(--brand-green);
}

.mobile-preview {
  box-sizing: border-box;
  width: auto;
  height: 100%;
  aspect-ratio: 9 / 19.5;
  padding: 0.6rem;
  overflow: hidden;
  border: 1px solid #e1e3f0;
  border-radius: 2.25rem;
  background: #fff;
  box-shadow: 0 28px 70px rgb(39 40 79 / 14%);
}

.preview-slide {
  width: 100%;
  height: 100%;
  padding: 0 !important;
}

.mobile-preview-stage {
  display: flex;
  width: 100%;
  height: 100%;
  justify-content: flex-end;
}

.mobile-preview iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 1.7rem;
}

.video-slide {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.demo-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 1rem;
  box-shadow: 0 28px 70px rgb(39 40 79 / 14%);
}

.solution-demo-video {
  display: block;
  width: 100%;
  max-height: 65vh;
  object-fit: contain;
  border: 0.35rem solid #ffffff;
  border-radius: 1.25rem;
  box-shadow: 0 1.25rem 3.5rem rgb(23 35 31 / 18%);
}

.shark-tank-slide {
  background: #ffffff;
  padding: 3rem 4rem;
}

.shark-tank-slide h1 {
  font-size: 3rem;
  font-weight: 800;
  margin-bottom: 1.5rem;
  color: #1a1a1a;
  letter-spacing: -0.02em;
}

.shark-tank-slide h2 {
  font-size: 2.2rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  color: #1a1a1a;
  letter-spacing: -0.02em;
}

.shark-tank-slide p {
  font-size: 1.3rem;
  line-height: 1.6;
  margin-bottom: 1rem;
  color: #1a1a1a;
}

.shark-tank-slide ul {
  font-size: 1.25rem;
  line-height: 1.8;
  margin: 1.5rem 0;
}

.shark-tank-slide li {
  margin-bottom: 0.8rem;
  color: #1a1a1a;
}

.shark-tank-slide strong {
  color: var(--brand-green-dark);
  font-weight: 700;
}

.team-slide {
  background: #ffffff;
  padding: 0 !important;
  width: 100%;
  height: 100%;
}

.slidev-layout.text-center h1::after {
  margin-right: auto;
  margin-left: auto;
}
</style>
