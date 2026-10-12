import type { Finding } from './core/check'

interface Props {
  findings: Finding[]
  onGoToTeam: (team: number) => void
}

export function CheckPage({ findings, onGoToTeam }: Props) {
  const groups = [
    { level: 'problem', title: 'Likely to cause trouble in the game' },
    { level: 'note', title: 'Unusual, and worth a look' },
  ] as const

  return (
    <main className="team help">
      <h2>Check ROM</h2>
      <p className="note">
        A look over everything in the editor for mistakes that are easy to make and hard to spot. It updates as you
        work, and nothing here stops you downloading.
      </p>
      {findings.length === 0 && <p>Nothing to report.</p>}
      {groups.map(({ level, title }) => {
        const list = findings.filter((finding) => finding.level === level)
        if (list.length === 0) return null
        return (
          <section key={level}>
            <h3>
              {title} ({list.length})
            </h3>
            <table className="left">
              <tbody>
                {list.map((finding, i) => (
                  <tr key={i}>
                    <td>
                      {finding.team === undefined ? (
                        finding.where
                      ) : (
                        <button className="link" onClick={() => onGoToTeam(finding.team!)}>
                          {finding.where}
                        </button>
                      )}
                    </td>
                    <td className="wrap">{finding.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
    </main>
  )
}
