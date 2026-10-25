import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
for (const path of ['overview/1', 'overview/']) {
  await page.goto(`http://localhost:3031/${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  console.log(path, '→', page.url(), 'thumbs:', await page.locator('.slidev-overview-item, .slide-container').count())
  console.log((await page.locator('body').innerText()).slice(0, 400).replace(/\n+/g, ' | '))
  await page.screenshot({ path: `review/${path.replaceAll('/', '-') || 'overview'}.png`, fullPage: true })
}
await browser.close()
