import { copyFileSync, existsSync } from 'fs'
import { join } from 'path'

const distDir = join(process.cwd(), 'dist')
const indexPath = join(distDir, 'index.html')
const fallbackPath = join(distDir, '404.html')

if (!existsSync(indexPath)) {
  throw new Error('dist/index.html not found. Run this script after vite build.')
}

copyFileSync(indexPath, fallbackPath)
console.log('Created dist/404.html for GitHub Pages SPA fallback')
