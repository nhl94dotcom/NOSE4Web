interface Props {
  // What is reset, as it reads after "Reset": "lines", "home colours".
  what: string
  // Whether it differs from the ROM that was opened. If not, there is nothing to reset.
  changed: boolean
  onReset: () => void
}

// Puts one part of the work back to how it is in the ROM that was opened.
export function ResetButton({ what, changed, onReset }: Props) {
  return (
    <button
      disabled={!changed}
      title={
        changed
          ? `Puts the ${what} back to how they are in the ROM you opened. Undo brings your changes back.`
          : `The ${what} are as they are in the ROM you opened.`
      }
      onClick={onReset}
    >
      Reset {what}
    </button>
  )
}
