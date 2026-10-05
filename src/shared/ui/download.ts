export function downloadBlob(blob: Blob, fileName: string, revokeDelayMs = 1000) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  if (revokeDelayMs > 0) {
    setTimeout(() => URL.revokeObjectURL(url), revokeDelayMs)
  } else {
    URL.revokeObjectURL(url)
  }
}
