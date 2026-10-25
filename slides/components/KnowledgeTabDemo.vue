<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useSlideContext } from '@slidev/client'

const files = [
  { name: 'Lernskript_Kapitel_03.pdf', type: 'PDF', icon: 'pdf' },
  { name: 'Notizen_Klausur.pdf', type: 'PDF', icon: 'pdf' },
  { name: 'Vorlesungsfolie.png', type: 'IMG', icon: 'image' },
]

const processing = ref(false)
const complete = ref(false)
const knowledgeOpen = ref(false)
const filesVisible = ref(false)
const { $clicks } = useSlideContext()
let filesTimer: ReturnType<typeof setTimeout> | undefined
let extractionTimer: ReturnType<typeof setTimeout> | undefined

function extractKnowledge() {
  if (processing.value || complete.value)
    return

  processing.value = true
  extractionTimer = setTimeout(() => {
    processing.value = false
    complete.value = true
  }, 1800)
}

watch($clicks, (click) => {
  if (click < 1) {
    if (filesTimer)
      clearTimeout(filesTimer)
    if (extractionTimer)
      clearTimeout(extractionTimer)
    filesTimer = undefined
    extractionTimer = undefined
    filesVisible.value = false
    processing.value = false
    complete.value = false
    knowledgeOpen.value = false
    return
  }

  if (!filesVisible.value && !filesTimer) {
    filesTimer = setTimeout(() => {
      filesVisible.value = true
      filesTimer = undefined
    }, 650)
  }

  if (click >= 2)
    extractKnowledge()
}, { immediate: true })

onBeforeUnmount(() => {
  if (filesTimer)
    clearTimeout(filesTimer)
  if (extractionTimer)
    clearTimeout(extractionTimer)
})
</script>

<template>
  <aside class="knowledge-demo" aria-label="Interaktive Vorschau des Knowledge-Tabs">
    <template v-if="$clicks >= 1">
      <div class="brand-bar">
        <img src="/assets/brAIngAIm.webp" alt="brAIn.gAIn" />
        <div class="app-actions" aria-hidden="true">
          <span><svg viewBox="0 0 24 24"><path d="M5 5h14v5H5zM5 14h14v5H5zM8 7.5h.01M8 16.5h.01" /></svg></span>
          <span><svg viewBox="0 0 24 24"><path d="M7 3h8l4 4v14H7zM15 3v5h4M10 12h6M10 16h6" /></svg></span>
          <span><svg class="material-icon" viewBox="0 0 24 24"><path d="M12.1 2.2c-5.4 0-9.8 4.4-9.8 9.8s4.4 9.8 9.8 9.8c4.8 0 8.8-3.5 9.6-8.1-1.3 1.2-3 1.9-4.9 1.9-4 0-7.2-3.2-7.2-7.2 0-2.5 1.3-4.7 3.2-6-.2 0-.5-.1-.7-.1Z" /></svg></span>
        </div>
      </div>

      <template v-if="!knowledgeOpen">
        <h3 class="knowledge-title">Knowledge</h3>

        <div class="projects" aria-label="Projekte">
          <div class="folder new-folder" aria-label="Neues Projekt">
            <svg class="folder-icon" viewBox="0 0 48 48" aria-hidden="true">
              <path d="M5 13h15l5 5h18v22H5zM24 23v11m-5.5-5.5h11" />
            </svg>
          </div>
          <div class="folder selected">
            <svg class="folder-icon" viewBox="0 0 48 48" aria-hidden="true">
              <path d="M5 13h15l5 5h18v22H5z" />
            </svg>
            <span class="folder-name">Hackathon</span>
            <span class="folder-count">3</span>
          </div>
          <div class="folder">
            <svg class="folder-icon purple" viewBox="0 0 48 48" aria-hidden="true">
              <path d="M5 13h15l5 5h18v22H5z" />
            </svg>
            <span class="folder-name">Informatik</span>
            <span class="folder-count">42</span>
          </div>
          <div class="folder">
            <svg class="folder-icon yellow" viewBox="0 0 48 48" aria-hidden="true">
              <path d="M5 13h15l5 5h18v22H5z" />
            </svg>
            <span class="folder-name">Biologie</span>
            <span class="folder-count">2</span>
          </div>
        </div>

        <button class="knowledge-heading" type="button" :disabled="!complete" @click="knowledgeOpen = true">
          <span>Extrahiertes Wissen</span>
          <span v-if="complete" class="knowledge-count">36</span>
        </button>

        <div class="file-list" aria-label="Dateien">
          <TransitionGroup tag="div" name="file">
            <div v-for="(file, index) in filesVisible ? files : []" :key="file.name" class="file-row" :style="{ '--file-index': index }">
              <span class="file-icon" :class="file.icon">{{ file.type }}</span>
              <span class="file-name">{{ file.name }}</span>
              <button class="delete-file" type="button" :aria-label="`Datei löschen: ${file.name}`">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 3v7m4-7v7" /></svg>
              </button>
            </div>
          </TransitionGroup>
        </div>

        <div class="action-row">
          <div class="upload-button">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m-5 5 5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></svg>
            <span>Upload</span>
          </div>
          <button
            class="extract-button"
            :class="{ processing, complete }"
            type="button"
            :disabled="processing || complete"
            :aria-label="processing ? 'Wissen wird extrahiert' : complete ? 'Wissen extrahiert' : 'Wissen extrahieren'"
            @click="extractKnowledge"
          >
            <svg v-if="processing" class="spinner" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" /></svg>
            <svg v-else-if="complete" viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" /></svg>
            <span v-if="processing" class="bouncing-label" aria-live="polite">
              <span v-for="(letter, index) in 'Wissen wird extrahiert'" :key="index" :style="{ '--letter-index': index }">{{ letter === ' ' ? '\u00a0' : letter }}</span>
            </span>
            <span v-else-if="complete">Wissen extrahiert</span>
            <span v-else>Wissen extrahieren</span>
          </button>
        </div>
      </template>

      <div v-else class="result-view">
        <button class="back-button" type="button" @click="knowledgeOpen = false">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12 4-6 6 6 6M6 10h11" /></svg>
          Zurück
        </button>
        <strong class="result-title">Extrahiertes Wissen</strong>
        <article class="flashcard">
          <h3>Was ist operante Konditionierung?</h3>
          <p>Lernen durch die Konsequenzen des eigenen Verhaltens – durch Verstärkung oder Bestrafung.</p>
        </article>
        <article class="flashcard">
          <h3>Was bewirkt positive Verstärkung?</h3>
          <p>Ein angenehmer Reiz folgt auf ein Verhalten und erhöht die Wahrscheinlichkeit, dass es wieder gezeigt wird.</p>
        </article>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.knowledge-demo {
  --demo-ink: #17231f;
  --demo-muted: #66746d;
  --demo-accent: #6257e8;
  --demo-line: #e1e3ec;
  position: absolute;
  top: clamp(28px, 5vh, 54px);
  right: clamp(36px, 7vw, 92px);
  bottom: clamp(28px, 5vh, 54px);
  display: flex;
  flex-direction: column;
  width: min(35%, 500px);
  max-width: none;
  height: auto;
  max-height: none;
  min-width: 0;
  min-height: 0;
  justify-self: center;
  padding: clamp(14px, 1.7vw, 20px);
  border: 1px solid var(--demo-line);
  border-radius: 18px;
  background: #f7f8fc;
  box-shadow: 0 18px 42px rgb(39 40 79 / 12%);
  overflow: hidden;
  color: var(--demo-ink);
  font-family: 'Manrope', 'Segoe UI', sans-serif;
}

.brand-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--demo-line);
}

.brand-bar img {
  display: block;
  width: 62px;
  height: 38px;
  object-fit: contain;
}

.app-actions {
  display: flex;
  gap: 7px;
}

.app-actions span {
  display: grid;
  place-items: center;
  width: 29px;
  height: 29px;
  border: 1px solid var(--demo-line);
  border-radius: 50%;
  background: #fff;
  color: var(--demo-ink);
}

.app-actions svg {
  width: 15px;
  fill: none;
  stroke: var(--demo-accent);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.app-actions span:last-child {
  width: 33px;
  height: 33px;
}

.app-actions span:last-child svg {
  width: 19px;
  stroke: var(--demo-ink);
}

.app-actions span:last-child .material-icon {
  fill: currentColor;
  stroke: none;
}

.knowledge-title {
  margin: 13px 0 11px;
  color: #15202b;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -.02em;
}

.projects {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  min-height: 78px;
  overflow: hidden;
}

.folder {
  position: relative;
  display: flex;
  flex: 0 0 64px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 0;
  height: 68px;
  padding: 3px;
  border: 1px solid transparent;
  border-radius: 11px;
  color: #15202b;
  font-size: 8px;
}

.folder.selected {
  border-color: var(--demo-accent);
  background: rgb(98 87 232 / 4%);
}

.folder-icon {
  width: 38px;
  height: 38px;
  fill: none;
  stroke: #74788c;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3;
}

.folder.selected .folder-icon {
  fill: #42a5f5;
  stroke: #42a5f5;
}

.folder-icon.purple {
  stroke: #ba3fc4;
}

.folder-icon.yellow {
  stroke: #f2b900;
}

.folder-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-count {
  position: absolute;
  top: 0;
  right: 0;
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--demo-accent);
  color: #fff;
  font-size: 8px;
  font-weight: 800;
}

.knowledge-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 34px;
  margin-top: 4px;
  padding: 6px 0;
  border: 0;
  border-top: 1px solid var(--demo-line);
  background: transparent;
  color: #75809a;
  cursor: pointer;
  font: inherit;
  font-size: 9px;
  text-align: left;
}

.knowledge-heading:disabled {
  cursor: default;
}

.file-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.file-list > div {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 26px;
  padding: 2px 3px;
  background: transparent;
  animation: file-arrive 380ms cubic-bezier(.2, .75, .25, 1) both;
  animation-delay: calc(var(--file-index) * 310ms + 180ms);
}

.file-icon {
  display: grid;
  flex: 0 0 24px;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 2px solid currentColor;
  border-radius: 5px;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: .03em;
}

.file-icon.pdf {
  background: #fff;
  color: #ed7379;
}

.file-icon.image {
  background: #fff;
  color: #aa751a;
}

.file-name {
  flex: 1;
  overflow: hidden;
  color: #15202b;
  font-size: 10px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delete-file {
  display: grid;
  flex: 0 0 25px;
  place-items: center;
  width: 25px;
  height: 25px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--demo-accent);
}

.delete-file svg {
  width: 17px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.9;
}

.action-row {
  display: flex;
  flex: 0 0 auto;
  align-items: stretch;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
}

.upload-button {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  min-height: 46px;
  border: 1px dashed #dce0ed;
  border-radius: 10px;
  color: #15202b;
  font-size: 10px;
}

.upload-button svg {
  width: 20px;
  fill: none;
  stroke: var(--demo-accent);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.extract-button {
  display: flex;
  flex: 0 0 43%;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  min-height: 46px;
  padding: 7px 9px;
  border: 0;
  border-radius: 10px;
  background: var(--demo-accent);
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 8px;
  font-weight: 800;
  transition: background-color 180ms ease, transform 180ms ease;
}

.extract-button:hover:not(:disabled) {
  background: #5145d3;
  transform: translateY(-1px);
}

.extract-button:focus-visible,
.knowledge-heading:focus-visible,
.back-button:focus-visible {
  outline: 2px solid #35b48d;
  outline-offset: 2px;
}

.extract-button:disabled {
  cursor: default;
}

.extract-button.processing {
  background: #5145d3;
}

.extract-button.complete {
  background: #ecebff;
  color: var(--demo-accent);
}

.extract-button > svg {
  flex: 0 0 17px;
  width: 17px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.spinner {
  animation: spin 800ms linear infinite;
}

.spinner circle {
  stroke-dasharray: 30 14;
}

.bouncing-label {
  display: inline-flex;
  white-space: pre;
}

.bouncing-label > span {
  animation: letter-bounce 700ms ease-in-out infinite alternate;
  animation-delay: calc(var(--letter-index) * 35ms);
}

.knowledge-count {
  min-width: 22px;
  padding: 4px 7px;
  border-radius: 99px;
  background: #eceef5;
  color: #75809a;
  font-size: 8px;
  font-weight: 600;
  text-align: center;
}

.result-view {
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-width: 0;
  padding-top: 9px;
}

.back-button {
  display: flex;
  align-items: center;
  align-self: flex-start;
  gap: 5px;
  min-height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--demo-accent);
  cursor: pointer;
  font: inherit;
  font-size: 9px;
  font-weight: 700;
}

.back-button svg {
  width: 15px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.result-title {
  font-size: 13px;
  font-weight: 800;
}

.flashcard {
  min-width: 0;
  padding: 10px 11px;
  border: 1px solid var(--demo-line);
  border-radius: 10px;
  background: #fff;
}

.flashcard h3 {
  margin: 0 0 5px;
  color: var(--demo-ink);
  font-size: 10px;
  font-weight: 800;
  line-height: 1.35;
}

.flashcard p {
  margin: 0;
  padding-left: 8px;
  border-left: 2px solid var(--demo-accent);
  color: var(--demo-muted);
  font-size: 9px;
  line-height: 1.4;
}

@keyframes file-arrive {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes letter-bounce {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-3px);
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .file-row,
  .spinner,
  .bouncing-label > span {
    animation: none;
  }

  .extract-button {
    transition: none;
  }
}

@media (max-height: 590px) {
  .knowledge-demo {
    padding: 10px 14px;
  }

  .brand-bar {
    min-height: 34px;
    padding-bottom: 6px;
  }

  .brand-bar img {
    height: 30px;
  }

  .knowledge-title {
    margin: 7px 0 5px;
  }

  .projects {
    min-height: 65px;
  }

  .folder {
    height: 59px;
  }

  .folder-icon {
    width: 32px;
    height: 32px;
  }

  .knowledge-heading {
    min-height: 28px;
  }

  .file-list {
    min-height: 40px;
  }

  .file-row {
    min-height: 26px;
  }
}
</style>
