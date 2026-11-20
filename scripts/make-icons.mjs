// Renders public/icon.svg to the PNG sizes the web manifest and iOS need.
// Run after changing the icon:  node scripts/make-icons.mjs
import { readFileSync } from 'node:fs'

import { chromium } from '@playwright/test'

const svg = readFileSync('public/icon.svg', 'utf8')

// Maskable icons can be cropped to a circle, so the art sits inside the central 80% on a
// full-bleed background.
const targets = [
  { file: 'public/pwa-192.png', size: 192, padding: 0, background: 'transparent' },
  { file: 'public/pwa-512.png', size: 512, padding: 0, background: 'transparent' },
  { file: 'public/pwa-maskable-512.png', size: 512, padding: 0.1, background: '#0f766e' },
  { file: 'public/apple-touch-icon.png', size: 180, padding: 0.06, background: '#0f766e' },
]

const browser = await chromium.launch()
try {
  for (const { file, size, padding, background } of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size } })
    const inset = Math.round(size * padding)
    await page.setContent(
      `<body style="margin:0;background:${background}">
         <div style="padding:${inset}px;width:${size - 2 * inset}px;height:${size - 2 * inset}px">
           ${svg.replace('<svg ', '<svg width="100%" height="100%" ')}
         </div>
       </body>`,
    )
    await page.screenshot({ path: file, omitBackground: background === 'transparent' })
    await page.close()
    console.log(`wrote ${file}`)
  }
} finally {
  await browser.close()
}
