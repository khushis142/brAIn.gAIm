import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.SLIDES_URL ?? 'http://localhost:3031'
const OUT = 'review'
const SLIDES = Number(process.env.SLIDES_COUNT ?? 8)

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1
})

const errors = []
page.on('console', (message) => {
  if (message.type() !== 'error') return
  if (message.text().includes('Failed to patch FloatingVue')) return
  errors.push(`[console] ${message.text()}`)
})
page.on('pageerror', (error) => {
  if (error.message.includes('Wake Lock permission')) return
  errors.push(`[pageerror] ${error.message}`)
})
page.on('requestfailed', (request) => {
  if (request.url().includes('@server-reactive')) return
  errors.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? ''}`)
})

await page.goto(`${BASE}/1`, { waitUntil: 'networkidle' })
await page.emulateMedia({ reducedMotion: 'reduce' })
await page.waitForTimeout(800)

for (let index = 1; index <= SLIDES; index += 1) {
  const report = await page.evaluate(() => {
    const layout = document.querySelector('.slidev-layout')
    const card = document.querySelector('.team-card')
    const map = document.querySelector('.germany-map')
    const bounds = (element) => {
      if (!element) return null
      const box = element.getBoundingClientRect()
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height)
      }
    }
    return {
      layout: bounds(layout),
      overflowX: layout ? layout.scrollWidth > layout.clientWidth + 1 : false,
      overflowY: layout ? layout.scrollHeight > layout.clientHeight + 1 : false,
      teamCard: bounds(card),
      germanyMap: bounds(map),
      pins: [...document.querySelectorAll('.pin-core')].map((pin) => bounds(pin))
    }
  })

  console.log(`slide ${index}: ${JSON.stringify(report)}`)
  await page.screenshot({ path: `${OUT}/slide-${index}.png` })

  if (index < SLIDES) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(500)
  }
}

if (errors.length) {
  console.log('\nErrors:')
  errors.forEach((error) => console.log(error))
} else {
  console.log('\nNo unexpected console or request errors.')
}

await browser.close()
