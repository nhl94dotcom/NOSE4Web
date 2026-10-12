import { useEffect, useRef, useState } from 'react'
import { hex } from './core/bytes'
import { colorLevels, colorRgb, colorWord, cssColor, cssHex, nearestColorWord, type Levels } from './core/color'

// The browser's own screen colour picker. Chrome and Edge have it; Firefox and
// Safari do not, and there the button is left out.
interface EyeDropperApi {
  open(): Promise<{ sRGBHex: string }>
}
const ScreenEyeDropper = (globalThis as { EyeDropper?: new () => EyeDropperApi }).EyeDropper

interface Template {
  width: number
  height: number
  pixels: Uint8Array
}

const templates = new Map<string, Promise<Template>>()

function loadTemplate(name: string): Promise<Template> {
  let template = templates.get(name)
  if (!template) {
    template = fetch(`${import.meta.env.BASE_URL}templates/${name}.idx`)
      .then((response) => response.arrayBuffer())
      .then((buffer) => {
        const data = new Uint8Array(buffer)
        return { width: data[0] | (data[1] << 8), height: data[2] | (data[3] << 8), pixels: data.subarray(4) }
      })
    templates.set(name, template)
  }
  return template
}

interface PreviewProps {
  template: string
  palette: number[]
  scale: number
}

// Draws one of the game's pictures using the given colours.
export function Preview({ template, palette, scale }: PreviewProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [image, setImage] = useState<Template | null>(null)

  useEffect(() => {
    let current = true
    loadTemplate(template).then((loaded) => current && setImage(loaded))
    return () => {
      current = false
    }
  }, [template])

  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context || !image) return
    const colors = palette.map(colorRgb)
    const data = context.createImageData(image.width, image.height)
    image.pixels.forEach((index, i) => {
      const color = colors[index]
      if (color) data.data.set([color[0], color[1], color[2], 255], i * 4)
    })
    context.putImageData(data, 0, 0)
  }, [image, palette])

  if (!image) return null
  return (
    <canvas
      ref={canvas}
      className="preview"
      width={image.width}
      height={image.height}
      style={{ width: image.width * scale }}
    />
  )
}

interface EditorProps {
  palette: number[]
  labels: string[]
  onChange: (palette: number[]) => void
}

// A row of colour swatches with controls to change the selected one.
export function PaletteEditor({ palette, labels, onChange }: EditorProps) {
  const [selected, setSelected] = useState(0)
  const word = palette[selected]
  const levels = colorLevels(word)

  function setWord(next: number) {
    onChange(palette.map((w, i) => (i === selected ? next : w)))
  }

  // Both ways of picking snap to the nearest colour the console can show.
  async function pickFromScreen() {
    if (!ScreenEyeDropper) return
    try {
      setWord(nearestColorWord((await new ScreenEyeDropper().open()).sRGBHex))
    } catch {
      // The user pressed Escape.
    }
  }

  const [imageUrl, setImageUrl] = useState('')
  const imageCanvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!imageUrl) return
    const image = new Image()
    image.onload = () => {
      const canvas = imageCanvas.current
      if (!canvas) return
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      canvas.getContext('2d', { willReadFrequently: true })?.drawImage(image, 0, 0)
    }
    image.src = imageUrl
    return () => URL.revokeObjectURL(imageUrl)
  }, [imageUrl])

  function pickFromImage(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget
    // The canvas may be drawn smaller than the image, so the click is scaled up.
    const x = Math.floor((event.nativeEvent.offsetX * canvas.width) / canvas.clientWidth)
    const y = Math.floor((event.nativeEvent.offsetY * canvas.height) / canvas.clientHeight)
    const pixel = canvas.getContext('2d', { willReadFrequently: true })?.getImageData(x, y, 1, 1).data
    if (pixel) setWord(nearestColorWord('#' + [pixel[0], pixel[1], pixel[2]].map((v) => v.toString(16).padStart(2, '0')).join('')))
  }

  return (
    <div className="palette-editor">
      <div className="palette">
        {palette.map((w, i) => (
          <button
            key={i}
            className={i === selected ? 'swatch selected' : 'swatch'}
            title={`${labels[i]} (${hex(w, 4)})`}
            style={{ background: cssColor(w) }}
            onClick={() => setSelected(i)}
          />
        ))}
      </div>
      <div className="color-controls">
        <strong>{labels[selected]}</strong>
        {(['Red', 'Green', 'Blue'] as const).map((channel, c) => (
          <label key={channel}>
            {channel} {levels[c]}
            <input
              type="range"
              min={0}
              max={7}
              value={levels[c]}
              onChange={(e) => {
                const next = levels.slice() as Levels
                next[c] = Number(e.target.value)
                setWord(colorWord(next))
              }}
            />
          </label>
        ))}
        <label>
          Pick
          <input type="color" value={cssHex(word)} onChange={(e) => setWord(nearestColorWord(e.target.value))} />
        </label>
        <span className="note">{hex(word, 4)}</span>
      </div>
      <div className="color-controls">
        {ScreenEyeDropper && (
          <button title="Click anywhere on your screen to take its colour" onClick={() => void pickFromScreen()}>
            Pick from screen
          </button>
        )}
        <label className="button">
          Pick from an image…
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) setImageUrl(URL.createObjectURL(file))
              e.target.value = ''
            }}
          />
        </label>
        {imageUrl && <button onClick={() => setImageUrl('')}>Close image</button>}
      </div>
      {imageUrl && (
        <>
          <p className="note">Click the image to give its colour to the selected swatch.</p>
          <canvas ref={imageCanvas} className="pick-image" onClick={pickFromImage} />
        </>
      )}
    </div>
  )
}
