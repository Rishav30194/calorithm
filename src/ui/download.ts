// Safari can drop a download whose link isn't in the document or whose URL is revoked at
// once, so the link is attached for the click and the URL outlives it.
const REVOKE_AFTER_MS = 40_000

export const download = ({ name, contents }: { name: string; contents: string }): void => {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}
