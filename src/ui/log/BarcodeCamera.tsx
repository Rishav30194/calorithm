import { useEffect, useRef, useState } from 'react'

import { strings } from '@/strings'

export type CameraProblem = 'denied' | 'no_camera' | 'failed'

type Props = {
  onCode: (code: string) => void
  onProblem: (problem: CameraProblem) => void
}

const SCAN_EVERY_MS = 250

const problemOf = (error: unknown): CameraProblem => {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no_camera'
  return 'failed'
}

// The back camera, read a few times a second until a product barcode shows. The decoder loads
// only now, and the camera stops as soon as this leaves the screen.
export const BarcodeCamera = ({ onCode, onProblem }: Props) => {
  const text = strings.log.barcode
  const video = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  // The latest callbacks, so the camera starts once rather than on every render.
  const handlers = useRef({ onCode, onProblem })
  useEffect(() => {
    handlers.current = { onCode, onProblem }
  })

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = () => {
      for (const track of stream?.getTracks() ?? []) track.stop()
    }

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        handlers.current.onProblem('no_camera')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        const element = video.current
        if (stopped || !element) return stop()
        element.srcObject = stream
        await element.play()
        const { createDetector } = await import('./detector')
        const detector = createDetector()
        if (stopped) return
        setReady(true)
        const scan = async () => {
          const code = await detector.detect(element).catch(() => null)
          if (stopped) return
          if (code) {
            stop()
            handlers.current.onCode(code)
          } else {
            timer = setTimeout(scan, SCAN_EVERY_MS)
          }
        }
        await scan()
      } catch (error) {
        stop()
        if (!stopped) handlers.current.onProblem(problemOf(error))
      }
    }

    void start()
    return () => {
      stopped = true
      clearTimeout(timer)
      stop()
    }
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <video
        ref={video}
        aria-label={text.camera}
        muted
        playsInline
        className="aspect-[4/3] w-full rounded-lg bg-surface object-cover"
      />
      <p role="status" className="text-sm text-muted">
        {ready ? text.aim : text.startingCamera}
      </p>
    </div>
  )
}
