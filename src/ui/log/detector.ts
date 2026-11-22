// Loaded only when the scanner opens: the decoder and its 947 kB WebAssembly stay out of the
// first load. iPhone Safari has no built-in BarcodeDetector, so every browser uses this one.
import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill'
// Served from the app, not the library's default CDN, and precached for offline scans.
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

import { upcEToUpcA } from '@/domain/barcode'

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? wasmUrl : prefix + path,
  },
})

export type Detector = {
  // The first product barcode in the frame, with UPC-E expanded, or null.
  detect: (frame: HTMLVideoElement) => Promise<string | null>
}

export const createDetector = (): Detector => {
  const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
  return {
    detect: async (frame) => {
      const [first] = await detector.detect(frame)
      if (!first) return null
      return first.format === 'upc_e' ? (upcEToUpcA(first.rawValue) ?? null) : first.rawValue
    },
  }
}
