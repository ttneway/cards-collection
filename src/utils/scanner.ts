import { useRef, useState } from 'react'

export function useScanner() {
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const scannerRef = useRef<any>(null)

  const startScanning = async (elementId: string) => {
    setScanning(true)
    setError(null)
    setResult(null)

    try {
      const Html5Qrcode = (await import('html5-qrcode')).Html5Qrcode
      const scanner = new Html5Qrcode(elementId)
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          setResult(decodedText)
          scanner.stop()
          setScanning(false)
        },
        () => {}
      )
    } catch (err) {
      setError('無法啟動相機，請確認已授予相機權限')
      setScanning(false)
    }
  }

  const stopScanning = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
    }
    setScanning(false)
  }

  return { result, error, scanning, startScanning, stopScanning }
}
