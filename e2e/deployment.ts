import { appendFile, cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize, sep } from 'node:path'

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

export type Deployment = {
  url: string
  // Changes the deployed service worker, as a new deployment does.
  deployAgain: () => Promise<void>
  close: () => Promise<void>
}

// Serves a private copy of the production build at /calorithm/ on its own port, so a test can
// deploy a new version without touching the preview server the other tests share. Chromium
// won't update a service worker whose script request Playwright intercepts, so a real server
// has to serve the changed file.
export const serveBuildCopy = async (): Promise<Deployment> => {
  const root = await mkdtemp(join(tmpdir(), 'calorithm-deployment-'))
  await cp(join(process.cwd(), 'dist'), root, { recursive: true })

  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost')
    const base = '/calorithm/'
    const relative = pathname.startsWith(base) ? pathname.slice(base.length) : null
    const file = relative === null ? null : normalize(join(root, relative || 'index.html'))
    if (file === null || !(file === root || file.startsWith(root + sep))) {
      response.writeHead(404).end()
      return
    }
    // Unknown paths get the app, as GitHub Pages' 404 page does.
    readFile(file)
      .then((body) => ({ body, type: types[extname(file)] }))
      .catch(async () => ({ body: await readFile(join(root, 'index.html')), type: types['.html'] }))
      .then(({ body, type }) => {
        response
          .writeHead(200, {
            'content-type': type ?? 'application/octet-stream',
            'cache-control': 'no-cache',
          })
          .end(body)
      })
      .catch(() => response.writeHead(500).end())
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('the server has no port')

  return {
    url: `http://localhost:${address.port}${'/calorithm/'}`,
    deployAgain: () => appendFile(join(root, 'sw.js'), '\n// a later deployment\n'),
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(root, { recursive: true, force: true })
    },
  }
}
