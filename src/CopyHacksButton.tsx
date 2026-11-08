import { openRom, type RomProject } from './core/rom'

interface Props {
  onRom: (other: RomProject, fileName: string) => void
  onError: (message: string) => void
}

// Reads another ROM, only to see which hacks it has. Nothing of it is kept.
export function CopyHacksButton({ onRom, onError }: Props) {
  return (
    <label className="button">
      Copy hacks from another ROM…
      <input
        type="file"
        accept=".bin,.smd,.md,.gen,.smc,.sfc"
        hidden
        aria-label="Copy hacks from another ROM"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          void file
            .arrayBuffer()
            .then((buffer) => onRom(openRom(new Uint8Array(buffer)), file.name))
            .catch((error) => onError(error instanceof Error ? error.message : String(error)))
        }}
      />
    </label>
  )
}
