const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
]

type BarcodePrintItem = {
  title: string
  value: string
  metaLines?: string[]
}

function normalizePrefix(prefix: string) {
  const value = prefix.trim().toUpperCase()
  if (value === 'TASK') return 'TSK'
  return value.replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'SCN'
}

export function createScanCode(prefix: string): string {
  const bytes = new Uint8Array(5)
  crypto.getRandomValues(bytes)
  const token = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
  return `${normalizePrefix(prefix)}${token}`
}

export function createQrImageUrl(value: string, size = 240) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(value)}`
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [headers.join(','), ...rows.map(row => headers.map(header => escape(row[header])).join(','))].join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function code128Values(value: string) {
  const values = [104]
  for (const char of value) {
    const code = char.charCodeAt(0)
    values.push(Math.min(Math.max(code - 32, 0), 95))
  }
  const checksum = values.reduce((sum, current, index) => sum + current * (index === 0 ? 1 : index), 0) % 103
  return [...values, checksum, 106]
}

function getCode128Bars(value: string) {
  let x = 0
  const bars: { x: number; width: number }[] = []

  for (const code of code128Values(value)) {
    const pattern = CODE128_PATTERNS[code]
    for (let i = 0; i < pattern.length; i += 1) {
      const width = Number(pattern[i])
      if (i % 2 === 0) bars.push({ x, width })
      x += width
    }
  }

  return { width: x, bars }
}

export function renderCode128Svg(value: string, options?: { height?: number; showText?: boolean; className?: string }) {
  const { width, bars } = getCode128Bars(value)
  const height = options?.height ?? 64
  const showText = options?.showText ?? true
  const className = options?.className ?? 'w-full h-24 bg-white rounded-xl'
  const textY = height - 5
  const barHeight = showText ? height - 20 : height - 8

  const rects = bars
    .map(bar => `<rect x="${bar.x}" y="4" width="${bar.width}" height="${barHeight}" fill="#020617" />`)
    .join('')

  const text = showText
    ? `<text x="${width / 2}" y="${textY}" text-anchor="middle" font-size="8" fill="#020617" font-family="monospace">${value}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" class="${className}" role="img" aria-label="${value}">${rects}${text}</svg>`
}

function sanitizeFilename(value: string) {
  return value.replace(/[<>:"/\\|?*]+/g, '-').trim() || 'barcode'
}

export function downloadBarcodePng(item: BarcodePrintItem, filename?: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 520
  const context = canvas.getContext('2d')
  if (!context) return

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)

  context.fillStyle = '#0f172a'
  context.font = 'bold 40px sans-serif'
  context.fillText(item.title, 60, 70)

  context.font = '24px sans-serif'
  ;(item.metaLines ?? []).forEach((line, index) => {
    context.fillText(line, 60, 120 + index * 34)
  })

  const { width, bars } = getCode128Bars(item.value)
  const marginX = 60
  const top = 220
  const targetWidth = canvas.width - marginX * 2
  const scale = targetWidth / width

  context.fillStyle = '#020617'
  bars.forEach(bar => {
    context.fillRect(marginX + bar.x * scale, top, Math.max(bar.width * scale, 2), 170)
  })

  context.font = '28px monospace'
  context.textAlign = 'center'
  context.fillText(item.value, canvas.width / 2, 440)

  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = filename ?? `${sanitizeFilename(item.title)}.png`
  link.click()
}

export function printBarcodeSheet(title: string, items: BarcodePrintItem[]) {
  if (items.length === 0) return

  const cardsHtml = items
    .map(item => {
      const metaHtml = (item.metaLines ?? []).map(line => `<p>${line}</p>`).join('')
      return `
        <article class="card">
          <h2>${item.title}</h2>
          <div class="meta">${metaHtml}</div>
          <div class="barcode">${renderCode128Svg(item.value, { height: 72, showText: true, className: 'barcode-svg' })}</div>
        </article>
      `
    })
    .join('')

  const printWindow = window.open('', '_blank', 'width=1000,height=800')
  if (!printWindow) return

  printWindow.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { margin: 0; padding: 24px; font-family: Arial, sans-serif; color: #0f172a; background: #fff; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
          .card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; break-inside: avoid; }
          .card h2 { margin: 0 0 10px; font-size: 20px; }
          .meta { margin-bottom: 12px; font-size: 14px; line-height: 1.5; }
          .meta p { margin: 0; }
          .barcode { background: #fff; }
          .barcode-svg { width: 100%; height: auto; display: block; }
          @media print {
            body { padding: 12px; }
            .grid { gap: 12px; }
          }
        </style>
      </head>
      <body>
        <div class="grid">${cardsHtml}</div>
        <script>
          window.onload = () => {
            window.print();
            window.close();
          };
        </script>
      </body>
    </html>
  `)
  printWindow.document.close()
}
