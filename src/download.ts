// Hands a file to the browser to save.
export function download(content: Uint8Array | string, fileName: string, type: string): void {
  const part = typeof content === 'string' ? content : content.slice().buffer
  const url = URL.createObjectURL(new Blob([part], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

// Removes characters that are not allowed in file names.
export function cleanFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '')
}
