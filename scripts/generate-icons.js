import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const sizes = [192, 512]
const iconDir = join(__dirname, '..', 'public', 'icons')

if (!existsSync(iconDir)) {
  mkdirSync(iconDir, { recursive: true })
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#4f46e5"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="20" fill="url(#bg)"/>
  <text x="50" y="68" text-anchor="middle" font-size="50" fill="white" font-family="Arial">&#9824;</text>
</svg>`

writeFileSync(join(iconDir, 'favicon.svg'), svg)
console.log('Created favicon.svg')

sizes.forEach(size => {
  const name = `icon-${size}x${size}.png`
  const filePath = join(iconDir, name)
  if (!existsSync(filePath)) {
    const png = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
      0x54, 0x08, 0xD7, 0x63, 0x60, 0x60, 0x00, 0x00,
      0x00, 0x02, 0x00, 0x01, 0xE5, 0x27, 0xDE, 0xFC,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
      0xAE, 0x42, 0x60, 0x82
    ])
    writeFileSync(filePath, png)
    console.log(`Created ${name}`)
  }
})
