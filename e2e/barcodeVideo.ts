import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// An EAN-13 barcode drawn into a Y4M video, for Chromium's fake camera
// (--use-file-for-fake-video-capture), so the scanner decodes a real image in the tests.

const L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
]
const G = [
  '0100111',
  '0110011',
  '0011011',
  '0100001',
  '0011101',
  '0111001',
  '0000101',
  '0010001',
  '0001001',
  '0010111',
]
const R = [
  '1110010',
  '1100110',
  '1101100',
  '1000010',
  '1011100',
  '1001110',
  '1010000',
  '1000100',
  '1001000',
  '1110100',
]
// Which left-half digits use G codes, picked by the first digit.
const PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
]

const modulesOf = (code: string): string => {
  const digits = [...code].map(Number)
  const [first = 0, ...rest] = digits
  const parity = PARITY[first] ?? ''
  const left = rest
    .slice(0, 6)
    .map((digit, index) => (parity[index] === 'G' ? G : L)[digit])
    .join('')
  const right = rest
    .slice(6)
    .map((digit) => R[digit])
    .join('')
  return `101${left}01010${right}101`
}

const WIDTH = 640
const HEIGHT = 480
const MODULE_PX = 5
const FRAMES = 5

// Writes the video to a temporary file and returns its path.
export const barcodeVideo = (code: string): string => {
  const modules = modulesOf(code)
  const left = Math.floor((WIDTH - modules.length * MODULE_PX) / 2)
  const luma = Buffer.alloc(WIDTH * HEIGHT, 255)
  for (let y = 120; y < 360; y += 1) {
    for (let index = 0; index < modules.length; index += 1) {
      if (modules[index] !== '1') continue
      luma.fill(0, y * WIDTH + left + index * MODULE_PX, y * WIDTH + left + (index + 1) * MODULE_PX)
    }
  }
  const chroma = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2) * 2, 128)
  const frame = Buffer.concat([Buffer.from('FRAME\n'), luma, chroma])
  const header = Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F10:1 Ip A1:1 C420jpeg\n`)
  const path = join(tmpdir(), `calorithm-barcode-${code}.y4m`)
  writeFileSync(path, Buffer.concat([header, ...Array.from({ length: FRAMES }, () => frame)]))
  return path
}
