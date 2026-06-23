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

function sanitizeFilename(value: string) {
  return value.replace(/[<>:"/\\|?*]+/g, '-').trim() || 'qr-code'
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('QR code image could not be loaded.'))
    image.src = src
  })
}

export function createScanCode(prefix: string): string {
  const bytes = new Uint8Array(5)
  crypto.getRandomValues(bytes)
  const token = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
  return `${normalizePrefix(prefix)}${token}`
}

export function createQrImageUrl(value: string, size = 240) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&data=${encodeURIComponent(value)}`
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

export async function downloadBarcodePng(item: BarcodePrintItem, filename?: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 900
  const context = canvas.getContext('2d')
  if (!context) return

  const qrImage = await loadImage(createQrImageUrl(item.value, 700))

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)

  context.fillStyle = '#0f172a'
  context.textAlign = 'left'
  context.font = 'bold 44px sans-serif'
  context.fillText(item.title, 60, 80)

  context.font = '26px sans-serif'
  ;(item.metaLines ?? []).forEach((line, index) => {
    context.fillText(line, 60, 135 + index * 34)
  })

  const qrSize = 620
  const qrX = Math.round((canvas.width - qrSize) / 2)
  const qrY = 220
  context.drawImage(qrImage, qrX, qrY, qrSize, qrSize)

  context.font = '28px monospace'
  context.textAlign = 'center'
  context.fillText(item.value, canvas.width / 2, 875)

  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = filename ?? `${sanitizeFilename(item.title)}.png`
  link.click()
}

export function printBarcodeSheet(title: string, items: BarcodePrintItem[]) {
  if (items.length === 0) return

  const cardsHtml = items
    .map(item => {
      const metaHtml = (item.metaLines ?? []).map(line => `<p>${escapeHtml(line)}</p>`).join('')
      const qrUrl = createQrImageUrl(item.value, 420)
      return `
        <article class="card">
          <h2>${escapeHtml(item.title)}</h2>
          <div class="meta">${metaHtml}</div>
          <div class="qr-wrap">
            <img class="qr" src="${qrUrl}" alt="${escapeHtml(item.value)}" />
          </div>
          <p class="value">${escapeHtml(item.value)}</p>
        </article>
      `
    })
    .join('')

  const printWindow = window.open('', '_blank', 'width=1000,height=800')
  if (!printWindow) return

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { margin: 0; padding: 24px; font-family: Arial, sans-serif; color: #0f172a; background: #fff; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
          .card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; break-inside: avoid; text-align: center; }
          .card h2 { margin: 0 0 10px; font-size: 20px; text-align: left; }
          .meta { margin-bottom: 12px; font-size: 14px; line-height: 1.5; text-align: left; }
          .meta p { margin: 0; }
          .qr-wrap { display: flex; justify-content: center; align-items: center; padding: 12px 0 8px; }
          .qr { width: 240px; height: 240px; object-fit: contain; }
          .value { margin: 8px 0 0; font-size: 13px; font-family: monospace; word-break: break-all; }
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
