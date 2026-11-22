// Loaded only when a label photo is first read: text recognition and its data (about 7 MB
// before compression) stay out of the first load, come from the app rather than a CDN, and
// are cached after first use. Photos never leave the device (decision 0030).
import Tesseract from 'tesseract.js'
import workerUrl from 'tesseract.js/dist/worker.min.js?url'
// The SIMD build, which iPhone Safari (16.4 and later) and current browsers run; a browser
// without SIMD fails to start it, and the panel then offers pasting the text instead.
import coreUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url'

// Phone photos are far larger than text recognition needs; smaller is faster.
const MAX_SIDE = 2000

const scaled = async (photo: Blob): Promise<HTMLCanvasElement> => {
  const bitmap = await createImageBitmap(photo)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('no 2D canvas to draw the photo on')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas
}

// tesseract.js 7.0.0 loads language data only from LANG_PATH/eng.traineddata.gz; passing the
// data in directly starts the engine with the data as the language's name. vite.config.ts
// serves the file there.
const langPath = (): string =>
  new URL(`${import.meta.env.BASE_URL}${__TESSDATA_DIR__}`, window.location.href).href

// The photo's text, line by line. Progress runs from 0 to 1 while the text is read. Aborting
// stops the worker, so a closed panel doesn't keep downloading or reading.
export const readLabelPhoto = async (
  photo: Blob,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
): Promise<string> => {
  const image = await scaled(photo)
  signal.throwIfAborted()
  const worker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
    workerPath: workerUrl,
    corePath: coreUrl,
    langPath: langPath(),
    gzip: true,
    workerBlobURL: false,
    // The service worker caches the data; the library's own copy would store it twice.
    cacheMethod: 'none',
    logger: (message) => {
      if (message.status === 'recognizing text') onProgress(message.progress)
    },
  })
  const stop = () => void worker.terminate()
  signal.addEventListener('abort', stop)
  try {
    signal.throwIfAborted()
    const result = await worker.recognize(image)
    return result.data.text
  } finally {
    signal.removeEventListener('abort', stop)
    await worker.terminate()
  }
}
