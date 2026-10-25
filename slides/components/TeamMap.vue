<template>
  <div class="team-slide">
    <h1>Unser Team</h1>

    <div class="members">
      <article
        v-for="(member, index) in displayMembers"
        :key="`${member.name}-${index}`"
        class="member"
      >
        <img :src="encodeURI(member.photo)" :alt="member.name" />
        <h2>{{ member.name }}</h2>
        <p>{{ member.role }}</p>
        <p class="location">📍 {{ member.city }}</p>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface TeamMember {
  name: string
  role: string
  city: string
  photo: string
}

const props = defineProps<{
  members?: TeamMember[]
}>()

const teamMembers: TeamMember[] = [
  { name: 'Joachim Kern', role: 'Backend', city: 'Altenstadt', photo: '/team-assets/Joachim_Kern_Altenstadt_Backend.png' },
  { name: 'Daniel Reer', role: 'Content & Games', city: 'Buchen', photo: '/team-assets/Daniel_Reer_Buchen_Content_And_Games.png' },
  { name: 'Frederick Heilmann', role: 'Infra & Firefighting', city: 'Darmstadt', photo: '/team-assets/Frederick_Heilmann_Darmstadt_Infra_and_Firefighting.png' },
  { name: 'Justin Troemel', role: 'Frontend & Marketing', city: 'Darmstadt', photo: '/team-assets/Justin_Troemel_Darmstadt_Frontend_Marketing.png' },
  { name: 'Moritz Bengel', role: 'Backend & Database', city: 'Darmstadt', photo: '/team-assets/Moritz_Bengel_Darmstadt_Backend_and_Database.png' },
  { name: 'Andri Akymov', role: 'Frontend', city: 'Fulda', photo: '/team-assets/Andri_Akymov_Fulda_Frontend.png' },
  { name: 'Maik Jökel', role: 'Frontend', city: 'Neuhof', photo: '/team-assets/Maik_Jökel_Fulda_Frontend.png' },
  { name: 'Maximilian Reiter', role: 'Frontend & UI', city: 'Mühlheim am Main', photo: '/team-assets/Maximilian_Reiter_Mühlheim_am_Main_Frontend_And_UI.png' },
  { name: 'Avantika Ajit', role: 'Frontend', city: 'Stuttgart', photo: '/team-assets/Avantika_Ajit_Stuttgart_Frontend.png' },
  { name: 'Khushi Shah', role: 'Frontend', city: 'Stuttgart', photo: '/team-assets/Khushi_Shah_Stuttgart_Frontend.png' },
  { name: 'Yanqing Ma', role: 'PM', city: 'Stuttgart', photo: '/team-assets/Yanqing_Ma_Stuttgart_PM.png' },
]

const displayMembers = computed(() =>
  [...(props.members?.length ? props.members : teamMembers)]
    .sort((a, b) => a.city.localeCompare(b.city, 'de'))
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
  font-weight: 700;
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
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  flex: 1;
  align-content: center;
  justify-items: center;
  gap: 0.85rem 1.2%;
  min-height: 0;
}

.member {
  grid-column: span 2;
  width: 100%;
  min-width: 0;
  text-align: center;
}

.member:nth-child(7) {
  grid-column: 2 / span 2;
}

.member img {
  display: block;
  width: 100%;
  height: 7.6rem;
  object-fit: contain;
}

.member h2 {
  margin: 0.1rem 0 0;
  color: #191a2a;
  font-size: 0.9rem;
  font-weight: 800;
  line-height: 1.2;
}

.member p {
  margin: 0.12rem 0 0;
  color: #717386;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.2;
}

.member .location {
  color: #35b48d;
  font-weight: 800;
}

@media (max-width: 760px) {
  .team-slide { padding-right: 1rem; padding-left: 1rem; }
  .members { grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 0.5rem 1%; }
  .member:nth-child(7) { grid-column: auto / span 2; }
  .member:nth-child(9) { grid-column: 2 / span 2; }
  .member img { height: 6.4rem; }
  .member h2 { font-size: 0.78rem; }
  .member p { font-size: 0.66rem; }
}
</style>
