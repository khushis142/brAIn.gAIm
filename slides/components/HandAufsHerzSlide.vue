<template>
  <div class="heart-slide">
    <div class="heart-field" aria-hidden="true">
      <svg
        v-for="heart in hearts"
        :key="heart.id"
        class="floating-heart"
        :style="{
          '--heart-left': heart.left,
          '--heart-size': heart.size,
          '--heart-duration': heart.duration,
          '--heart-delay': heart.delay,
          '--heart-drift': heart.drift,
          '--heart-opacity': heart.opacity,
        }"
        viewBox="0 0 32 32"
      >
        <path d="M16 28.2 4.4 16.8A7.3 7.3 0 0 1 14.7 6.5L16 7.8l1.3-1.3a7.3 7.3 0 0 1 10.3 10.3L16 28.2Z" />
      </svg>
    </div>
    <main class="heart-content">
      <span class="heart-eyebrow">EINE EHRLICHE FRAGE</span>
      <h1>Hand aufs Herz...</h1>
      <span class="heart-accent" aria-hidden="true"></span>
    </main>
  </div>
</template>

<script setup lang="ts">
const hearts = [
  { id: 1, left: '7%', size: '24px', duration: '8s', delay: '-2s', drift: '24px', opacity: '.48' },
  { id: 2, left: '17%', size: '16px', duration: '10s', delay: '-7s', drift: '-18px', opacity: '.3' },
  { id: 3, left: '28%', size: '30px', duration: '9s', delay: '-5s', drift: '34px', opacity: '.36' },
  { id: 4, left: '39%', size: '18px', duration: '11s', delay: '-1s', drift: '-26px', opacity: '.42' },
  { id: 5, left: '51%', size: '26px', duration: '8.5s', delay: '-6s', drift: '20px', opacity: '.34' },
  { id: 6, left: '63%', size: '17px', duration: '10s', delay: '-3s', drift: '-32px', opacity: '.46' },
  { id: 7, left: '74%', size: '28px', duration: '9.5s', delay: '-8s', drift: '28px', opacity: '.32' },
  { id: 8, left: '86%', size: '20px', duration: '11s', delay: '-4s', drift: '-20px', opacity: '.4' },
  { id: 9, left: '95%', size: '15px', duration: '8s', delay: '-6s', drift: '18px', opacity: '.3' },
]
</script>

<style scoped>
.heart-slide {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 50% 54%, #e9f4ef 0, #f7f9f7 48%, #fff 82%);
  color: #17231f;
  font-family: 'Manrope', 'Segoe UI', sans-serif;
}

.heart-field {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.floating-heart {
  position: absolute;
  bottom: -48px;
  left: var(--heart-left);
  width: var(--heart-size);
  height: var(--heart-size);
  fill: #35b48d;
  opacity: var(--heart-opacity);
  animation: heart-float var(--heart-duration) linear var(--heart-delay) infinite;
}

.heart-content {
  position: relative;
  z-index: 1;
  text-align: center;
}

.heart-eyebrow {
  color: #218768;
  font-size: clamp(10px, 1vw, 13px);
  font-weight: 800;
  letter-spacing: .16em;
}

.heart-content h1 {
  margin: 18px 0 0;
  color: #17231f;
  font-size: clamp(54px, 8vw, 104px);
  font-weight: 800;
  letter-spacing: -.065em;
  line-height: 1.02;
}

.heart-accent {
  display: block;
  width: 70px;
  height: 6px;
  margin: 38px auto 0;
  border-radius: 99px;
  background: #35b48d;
}

@keyframes heart-float {
  0% { transform: translate3d(0, 0, 0) scale(.8); }
  15% { opacity: var(--heart-opacity); }
  100% { transform: translate3d(var(--heart-drift), -115vh, 0) scale(1.12); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .floating-heart { animation: none; }
}
</style>
