import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const svg = readFileSync('node_modules/@svg-maps/germany/germany.svg', 'utf8')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(svg)
const boxes = await page.evaluate(() => {
  return [...document.querySelectorAll('path')].map((path) => {
    const box = path.getBBox()
    const name = path.getAttribute('id') ?? path.dataset.name ?? ''
    return { id: name, x: box.x, y: box.y, w: box.width, h: box.height }
  })
})
console.log(JSON.stringify(boxes, null, 2))
await browser.close()
