// Used when the browser will not let the page use the system clipboard, which
// still allows copying between teams within this tab.
let lastCopied = ''

export async function writeClipboard(text: string): Promise<void> {
  lastCopied = text
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // The copy is still held in lastCopied.
  }
}

export async function readClipboard(): Promise<string> {
  try {
    return await navigator.clipboard.readText()
  } catch {
    return lastCopied
  }
}
