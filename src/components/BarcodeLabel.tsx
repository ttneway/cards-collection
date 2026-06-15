const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112'
]

function code128Values(value: string) {
  const values = [104]
  for (const char of value) {
    const code = char.charCodeAt(0)
    values.push(Math.min(Math.max(code - 32, 0), 95))
  }
  const checksum = values.reduce((sum, current, index) => sum + current * (index === 0 ? 1 : index), 0) % 103
  return [...values, checksum, 106]
}

function Code128({ value }: { value: string }) {
  let x = 0
  const bars: { x: number; width: number }[] = []

  for (const code of code128Values(value)) {
    const pattern = CODE128_PATTERNS[code]
    for (let i = 0; i < pattern.length; i++) {
      const width = Number(pattern[i])
      if (i % 2 === 0) bars.push({ x, width })
      x += width
    }
  }

  return (
    <svg viewBox={`0 0 ${x} 58`} className="w-full h-20 bg-white rounded" role="img" aria-label={value}>
      {bars.map((bar, index) => (
        <rect key={`${bar.x}-${index}`} x={bar.x} y="4" width={bar.width} height="42" fill="#020617" />
      ))}
      <text x={x / 2} y="55" textAnchor="middle" fontSize="6" fill="#020617" fontFamily="monospace">
        {value}
      </text>
    </svg>
  )
}

function QrStyleCode({ value }: { value: string }) {
  const size = 17
  const cells = Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size)
    const col = index % size
    const finder =
      (row < 5 && col < 5) ||
      (row < 5 && col >= size - 5) ||
      (row >= size - 5 && col < 5)
    if (finder) return row === 0 || col === 0 || row === 4 || col === 4 || (row >= 2 && row <= 2 && col >= 2 && col <= 2)
    const char = value.charCodeAt(index % value.length) || 0
    return ((char + row * 7 + col * 11 + index) % 5) < 2
  })

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-32 h-32 bg-white rounded p-2" role="img" aria-label={value}>
      {cells.map((filled, index) => filled && (
        <rect key={index} x={index % size} y={Math.floor(index / size)} width="1" height="1" fill="#020617" />
      ))}
    </svg>
  )
}

export default function BarcodeLabel({ value, label }: { value: string | null | undefined; label: string }) {
  if (!value) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-sm text-slate-400">
        尚未產生條碼
      </div>
    )
  }

  return (
    <div className="bg-slate-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-sm">{label}</p>
        <code className="text-xs text-indigo-300 break-all">{value}</code>
      </div>
      <div className="grid sm:grid-cols-[140px_1fr] gap-4 items-center">
        <div className="flex justify-center">
          <QrStyleCode value={value} />
        </div>
        <Code128 value={value} />
      </div>
    </div>
  )
}
