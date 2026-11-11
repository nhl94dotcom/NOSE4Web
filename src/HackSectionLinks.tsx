import type { HackGroup } from './core/hackgroups'

// Links to the sections of a Hacks page, which is long. Each section has the
// id hacks-<group id>; Apply, always last, is hacks-apply.
export function HackSectionLinks({ groups }: { groups: HackGroup<unknown>[] }) {
  const sections = [...groups.map((group) => ({ id: group.id, title: group.title })), { id: 'apply', title: 'Apply' }]
  return (
    <p className="note">
      Sections:{' '}
      {sections.map((section, i) => (
        <span key={section.id}>
          {i > 0 && ' · '}
          <a
            href={`#hacks-${section.id}`}
            onClick={(e) => {
              // Scrolled to here, so the address (which the editor does not use) is left alone.
              e.preventDefault()
              document.getElementById(`hacks-${section.id}`)?.scrollIntoView({ behavior: 'smooth' })
            }}
          >
            {section.title}
          </a>
        </span>
      ))}
    </p>
  )
}
