<script setup lang="ts">
import ZombieAvatar from './ZombieAvatar.vue'

const avatars = [
  { name: 'Zombie', phase: 'STUFE 01', image: '/assets/zombie/zombie.svg', alt: 'Zombie-Avatar im grünen Zustand' },
  { name: 'Halb Mensch', phase: 'STUFE 02', image: '/assets/zombie/half-human.svg', alt: 'Halb menschlicher Avatar mit geteilter Erscheinung' },
  { name: 'Mensch', phase: 'STUFE 03', image: '/assets/zombie/human.svg', alt: 'Menschlicher Avatar' },
]
</script>

<template>
  <div class="evolution-slide">
    <header class="evolution-heading">
      <span class="evolution-eyebrow">DEIN AVATAR ENTWICKELT SICH</span>
      <h1>Vom Zombie zum Menschen</h1>
    </header>

    <main class="evolution-stages" aria-label="Die drei Avatar-Zustände">
      <article v-for="avatar in avatars" :key="avatar.name" class="evolution-card">
        <span class="evolution-phase">{{ avatar.phase }}</span>
        <ZombieAvatar
          :avatar="avatar.name === 'Zombie' ? 'zombie' : avatar.name === 'Halb Mensch' ? 'half-human' : 'human'"
          :label="avatar.alt"
        />
        <h2>{{ avatar.name }}</h2>
      </article>
    </main>
  </div>
</template>

<style scoped>
.evolution-slide {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: clamp(16px, 2.5vh, 28px);
  width: 100%;
  height: 100%;
  padding: clamp(28px, 4.5vh, 48px) clamp(34px, 7vw, 90px);
  overflow: hidden;
  background:
    radial-gradient(ellipse at 50% 65%, #e9f5ef 0, #f8faf8 47%, #fff 80%);
  color: #17231f;
  font-family: 'Manrope', 'Segoe UI', sans-serif;
}

.evolution-slide * { box-sizing: border-box; }

.evolution-heading {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
}

.evolution-eyebrow {
  color: #218768;
  font-size: clamp(9px, .9vw, 12px);
  font-weight: 800;
  letter-spacing: .15em;
}

.evolution-heading h1 {
  margin: 8px 0 4px;
  color: #17231f;
  font-size: clamp(28px, 3.5vw, 44px);
  font-weight: 800;
  letter-spacing: -.065em;
  line-height: 1.08;
}

.evolution-stages {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: stretch;
  gap: clamp(18px, 3vw, 38px);
  width: 100%;
  max-width: 1050px;
  min-height: 0;
  margin: 0 auto;
}

.evolution-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  min-height: 0;
  padding: clamp(16px, 2.3vw, 28px);
  border: 1.5px solid #253d33;
  border-radius: 24px 18px 25px 19px / 18px 24px 17px 23px;
  background: #fffefa;
  box-shadow: 3px 4px 0 rgb(53 180 141 / 18%), 0 16px 42px rgb(24 60 45 / 8%);
}

.evolution-phase {
  align-self: flex-start;
  color: #218768;
  font-size: clamp(9px, .9vw, 12px);
  font-weight: 800;
  letter-spacing: .12em;
}

.evolution-card :deep(.zombie-avatar) {
  display: block;
  width: min(100%, 190px);
  min-height: 0;
  flex: 1 1 auto;
  margin: 6px 0;
}

.evolution-card h2 {
  margin: 0;
  color: #17231f;
  font-size: clamp(19px, 2.1vw, 27px);
  font-weight: 800;
  letter-spacing: -.055em;
  text-align: center;
}

@media (max-width: 650px) {
  .evolution-slide { overflow-y: auto; }
  .evolution-stages { grid-template-columns: 1fr; }
  .evolution-card { min-height: 240px; }
  .evolution-card :deep(.zombie-avatar) { height: 150px; flex: 0 1 150px; }
}

@media (max-height: 590px) {
  .evolution-slide { gap: 12px; padding-top: 18px; padding-bottom: 18px; }
  .evolution-card { padding: 12px; }
  .evolution-card :deep(.zombie-avatar) { width: min(100%, 145px); }
}
</style>
