import { readFileSync } from 'node:fs'
import { parse } from '@slidev/parser'

const markdown = readFileSync('slides.md', 'utf8')
const data = await parse(markdown, 'slides.md')
console.log('slides:', data.slides.length)
data.slides.forEach((slide, index) => {
  console.log(
    `\n--- slide ${index + 1} (raw lines ${slide.start + 1}-${slide.end}) ---`
  )
  console.log('frontmatter:', JSON.stringify(slide.frontmatter))
  console.log(JSON.stringify(slide.content.slice(0, 160)))
})
