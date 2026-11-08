import { useEffect, useRef, useState, type ReactNode } from 'react'
import { colorRgb, cssColor, GENESIS_COLORS, type ColorFormat } from './core/color'
import type { Picture } from './core/graphics'
import {
  fillPoints,
  flipped,
  linePoints,
  mirrored,
  paint,
  pixelAt,
  rectanglePoints,
  samePicture,
  shifted,
  type Point,
} from './core/paint'
import { PaletteEditor } from './Palette'

// Drawing a logo or banner pixel by pixel, in the colours the game gives it.
// Each stroke is handed on when the mouse button is let go, so undo takes back
// one stroke at a time.

type Tool = 'pencil' | 'eraser' | 'fill' | 'picker' | 'line' | 'rectangle' | 'box'

const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: 'pencil', label: 'Pencil', key: 'p' },
  { tool: 'eraser', label: 'Eraser', key: 'e' },
  { tool: 'fill', label: 'Fill', key: 'f' },
  { tool: 'picker', label: 'Pick a colour', key: 'i' },
  { tool: 'line', label: 'Line', key: 'l' },
  { tool: 'rectangle', label: 'Rectangle', key: 'r' },
  { tool: 'box', label: 'Filled rectangle', key: 'b' },
]

export interface PixelEditorProps {
  title: string
  picture: Picture
  // The colours a pixel's number stands for (16, or 128 for the SNES centre ice).
  palette: number[]
  format?: ColorFormat
  // The colour numbers that may be painted; 0, see-through, always may.
  colours: number[]
  // The colours that can be changed here, with the picture's own palette.
  editable?: { slots: number[]; onChange: (palette: number[]) => void }
  // What the game's limits make of the picture, shown as it is drawn.
  limit?: (picture: Picture) => { text: string; over: boolean } | null
  // Anything a stroke changes besides its own pixels (see oneRowPerSquare).
  afterStroke?: (picture: Picture, points: Point[], colour: number) => Picture
  // The picture shown where the game shows it.
  context?: (picture: Picture) => ReactNode
  onCommit: (picture: Picture) => void
  onClose: () => void
}

export function PixelEditor({ title, picture, palette, format = GENESIS_COLORS, colours, editable, limit, afterStroke, context, onCommit, onClose }: PixelEditorProps) {
  const [tool, setTool] = useState<Tool>('pencil')
  const [colour, setColour] = useState(colours[0] ?? 1)
  const [zoom, setZoom] = useState(picture.width > 64 ? 6 : 8)
  const [grid, setGrid] = useState(true)
  const [mirror, setMirror] = useState(false)
  // The picture as drawn so far in a stroke, and where the stroke began and last was.
  const [draft, setDraft] = useState<Picture | null>(null)
  const stroke = useRef<{ start: Point; last: Point; base: Picture; points: Point[] } | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const shown = draft ?? picture
  const painted = tool === 'eraser' ? 0 : colour

  useEffect(() => {
    const context2d = canvas.current?.getContext('2d')
    if (!context2d) return
    const { width, height } = shown
    const rgb = palette.map((word) => colorRgb(word, format))
    context2d.clearRect(0, 0, width * zoom, height * zoom)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = shown.pixels[y * width + x]
        if (value === 0) continue
        const [r, g, b] = rgb[value] ?? [255, 0, 255]
        context2d.fillStyle = `rgb(${r}, ${g}, ${b})`
        context2d.fillRect(x * zoom, y * zoom, zoom, zoom)
      }
    }
    if (grid && zoom >= 4) {
      for (let x = 0; x <= width; x++) {
        context2d.fillStyle = x % 8 === 0 ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.12)'
        context2d.fillRect(x * zoom - (x === width ? 1 : 0), 0, 1, height * zoom)
      }
      for (let y = 0; y <= height; y++) {
        context2d.fillStyle = y % 8 === 0 ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.12)'
        context2d.fillRect(0, y * zoom - (y === height ? 1 : 0), width * zoom, 1)
      }
    }
  }, [shown, palette, format, zoom, grid])

  const where = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect()
    const scale = box.width / shown.width
    return [Math.floor((event.clientX - box.left) / scale), Math.floor((event.clientY - box.top) / scale)]
  }
  const withMirror = (points: Point[]) => (mirror ? mirrored(picture, points) : points)
  const painting = (base: Picture, points: Point[], value: number) => {
    const all = withMirror(points)
    const next = paint(base, all, value)
    return afterStroke ? afterStroke(next, all, value) : next
  }
  const commit = (next: Picture) => {
    if (!samePicture(next, picture)) onCommit(next)
  }

  function down(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return
    const point = where(event)
    if (tool === 'picker') {
      const value = pixelAt(picture, point)
      if (value === 0) setTool('eraser')
      else if (colours.includes(value)) setColour(value)
      return
    }
    if (tool === 'fill') {
      commit(painting(picture, fillPoints(picture, point), painted))
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    stroke.current = { start: point, last: point, base: picture, points: [point] }
    setDraft(painting(picture, [point], painted))
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    const current = stroke.current
    if (!current) return
    const point = where(event)
    if (point[0] === current.last[0] && point[1] === current.last[1]) return
    if (tool === 'pencil' || tool === 'eraser') {
      current.points.push(...linePoints(current.last, point).slice(1))
      current.last = point
      setDraft(painting(current.base, current.points, painted))
    } else {
      current.last = point
      const shape = tool === 'line' ? linePoints(current.start, point) : rectanglePoints(current.start, point, tool === 'box')
      setDraft(painting(current.base, shape, painted))
    }
  }

  function up() {
    if (!stroke.current) return
    stroke.current = null
    if (draft) commit(draft)
    setDraft(null)
  }

  const limitShown = limit?.(shown) ?? null
  // Past 16 a colour is in a row of 16: the SNES centre ice logo's.
  const name = (value: number) => (palette.length > 16 ? `Row ${value >> 4} colour ${value & 15}` : `Colour ${value}`)
  const swatch = (value: number) => (
    <button
      key={value}
      className={`paint-swatch${value === colour && tool !== 'eraser' ? ' chosen' : ''}`}
      aria-label={name(value)}
      aria-pressed={value === colour && tool !== 'eraser'}
      title={name(value)}
      style={{ background: cssColor(palette[value] ?? 0, format) }}
      onClick={() => {
        setColour(value)
        if (tool === 'eraser' || tool === 'picker') setTool('pencil')
      }}
    />
  )

  return (
    <div
      className="pixel-editor"
      role="group"
      aria-label={`Draw the ${title.toLowerCase()}`}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
        const chosen = TOOLS.find((t) => t.key === event.key.toLowerCase())
        if (chosen && !event.ctrlKey && !event.metaKey) setTool(chosen.tool)
      }}
    >
      <p className="paint-tools">
        {TOOLS.map((t) => (
          <button key={t.tool} aria-pressed={tool === t.tool} className={tool === t.tool ? 'chosen' : ''} title={`${t.label} (${t.key.toUpperCase()})`} onClick={() => setTool(t.tool)}>
            {t.label}
          </button>
        ))}
      </p>
      <p className="paint-tools">
        <label>
          <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Mirror left and right
        </label>{' '}
        <label>
          <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Grid
        </label>{' '}
        <label>
          Zoom{' '}
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            {[2, 4, 6, 8, 12, 16].map((z) => (
              <option key={z} value={z}>
                {z}×
              </option>
            ))}
          </select>
        </label>{' '}
        <button onClick={() => commit(flipped(picture, true))}>Flip left to right</button>{' '}
        <button onClick={() => commit(flipped(picture, false))}>Flip upside down</button>{' '}
        <span role="group" aria-label="Move the picture">
          <button aria-label="Move left" title="Move the picture one pixel left" onClick={() => commit(shifted(picture, -1, 0))}>
            ←
          </button>
          <button aria-label="Move right" title="Move the picture one pixel right" onClick={() => commit(shifted(picture, 1, 0))}>
            →
          </button>
          <button aria-label="Move up" title="Move the picture one pixel up" onClick={() => commit(shifted(picture, 0, -1))}>
            ↑
          </button>
          <button aria-label="Move down" title="Move the picture one pixel down" onClick={() => commit(shifted(picture, 0, 1))}>
            ↓
          </button>
        </span>
      </p>
      <div className="paint-colours" role="group" aria-label="Colours to paint with">
        <button
          className={`paint-swatch checkered${tool === 'eraser' ? ' chosen' : ''}`}
          aria-label="See-through"
          aria-pressed={tool === 'eraser'}
          title="See-through (the eraser)"
          onClick={() => setTool('eraser')}
        />
        {colours.map(swatch)}
      </div>
      <div className="paint-area">
        <div className="paint-canvas checkered">
          <canvas
            ref={canvas}
            width={shown.width * zoom}
            height={shown.height * zoom}
            aria-label={`${title}, drawn large`}
            // Clicking it gives it the keyboard, for the tools' letters.
            tabIndex={0}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            style={{ cursor: tool === 'picker' ? 'copy' : 'crosshair', touchAction: 'none' }}
          />
        </div>
        <div className="paint-side">
          <p className="note">As it is in the game:</p>
          <SmallView picture={shown} palette={palette} format={format} />
          {context?.(shown)}
          {limitShown && <p className={limitShown.over ? 'error' : 'note'}>{limitShown.text}</p>}
        </div>
      </div>
      {editable && editable.slots.length > 0 && (
        <>
          <p className="note">The colours of its own, which you can change here:</p>
          <PaletteEditor
            palette={editable.slots.map((slot) => palette[slot])}
            labels={editable.slots.map((slot) => `Colour ${slot}`)}
            format={format}
            onChange={(next) => {
              const out = palette.slice()
              editable.slots.forEach((slot, i) => (out[slot] = next[i]))
              editable.onChange(out)
            }}
          />
        </>
      )}
      <p>
        <button onClick={onClose}>Done drawing</button>{' '}
        <span className="note">Undo, at the top, takes back one stroke at a time.</span>
      </p>
    </div>
  )
}

function SmallView({ picture, palette, format }: { picture: Picture; palette: number[]; format: ColorFormat }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context2d = canvas.current?.getContext('2d')
    if (!context2d) return
    const rgb = palette.map((word) => colorRgb(word, format))
    const data = context2d.createImageData(picture.width, picture.height)
    picture.pixels.forEach((value, i) => {
      if (value !== 0) data.data.set([...(rgb[value] ?? [255, 0, 255]), 255], i * 4)
    })
    context2d.putImageData(data, 0, 0)
  }, [picture, palette, format])
  return <canvas ref={canvas} className="preview checkered" width={picture.width} height={picture.height} style={{ width: picture.width * 2 }} aria-label="Actual size" />
}
