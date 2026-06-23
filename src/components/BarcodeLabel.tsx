import { Download, Printer } from 'lucide-react'
import { createQrImageUrl, downloadBarcodePng, printBarcodeSheet } from '../utils/codes'

type BarcodeLabelProps = {
  value: string | null | undefined
  label: string
  metaLines?: string[]
  filename?: string
}

export default function BarcodeLabel({ value, label, metaLines = [], filename }: BarcodeLabelProps) {
  if (!value) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 text-sm text-slate-400">
        尚未產生條碼
      </div>
    )
  }

  const handleDownload = () => {
    void downloadBarcodePng(
      {
        title: label,
        value,
        metaLines
      },
      filename
    )
  }

  const handlePrint = () => {
    printBarcodeSheet(label, [
      {
        title: label,
        value,
        metaLines
      }
    ])
  }

  return (
    <div className="space-y-3 rounded-lg bg-slate-800 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <code className="mt-1 block break-all text-xs text-indigo-300">{value}</code>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
          >
            <Download size={16} /> 下載圖片
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
          >
            <Printer size={16} /> 列印條碼
          </button>
        </div>
      </div>

      {metaLines.length > 0 ? (
        <div className="space-y-1 text-xs text-slate-400">
          {metaLines.map(line => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}

      <div className="flex justify-center rounded-xl bg-white p-4">
        <img src={createQrImageUrl(value, 320)} alt={value} className="h-72 w-72 max-w-full object-contain" />
      </div>
    </div>
  )
}
