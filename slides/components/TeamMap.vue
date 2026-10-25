<template>
  <div class="team-slide">
    <h1>Unser Team</h1>

    <div class="members">
      <article
        v-for="(member, index) in displayMembers"
        :key="`${member.name}-${index}`"
        class="member"
      >
        <img :src="member.photo" :alt="member.name" />
        <h2>{{ member.name }}</h2>
        <p>{{ member.role }}</p>
        <p class="location">📍 {{ member.city }}</p>
      </article>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  members: {
    type: Array,
    default: () => []
  }
})

const moritz = {
  name: 'Moritz Bengel',
  role: 'Backend',
  city: 'Darmstadt',
  photo: '/team-assets/moritz.webp'
}

const displayMembers = computed(() =>
  props.members.length ? props.members.slice(0, 11) : Array.from({ length: 11 }, () => moritz)
)
</script>

<style scoped>
.team-slide {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 1.1rem 2rem 1.4rem;
  overflow: hidden;
  background: #ffffff;
  color: #191a2a;
  font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

h1 {
  margin: 0 0 0.6rem;
  color: #35b48d;
  font-size: 2.6rem;
  font-weight: 800;
  line-height: 1.1;
  text-align: center;
}

.members {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-content: center;
  justify-content: center;
  gap: 0.7rem 1%;
  min-height: 0;
}

.member {
  flex: 0 0 15%;
  min-width: 0;
  text-align: center;
}

.member img {
  display: block;
  width: 100%;
  height: 8.2rem;
  object-fit: contain;
}

.member h2 {
  margin: 0.1rem 0 0;
  color: #191a2a;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.2;
}

.member p {
  margin: 0.12rem 0 0;
  color: #717386;
  font-size: 0.8rem;
  line-height: 1.2;
}

.member .location {
  color: #35b48d;
}
</style>
