interface IsolationRecord {
  ariaHidden: string | null
  count: number
  inert: boolean
}

const isolationRecords = new WeakMap<HTMLElement, IsolationRecord>()

/**
 * Isolate body children for a modal without letting nested overlays restore
 * another overlay's state. Each element is restored only after its final owner
 * releases it, so teardown order does not matter.
 */
export function isolateBodyChildren(exclude: (element: HTMLElement) => boolean): () => void {
  const owned: HTMLElement[] = []

  for (const child of Array.from(document.body.children)) {
    if (!(child instanceof HTMLElement) || exclude(child)) {
      continue
    }

    const existing = isolationRecords.get(child)

    if (existing) {
      existing.count += 1
    } else {
      isolationRecords.set(child, {
        ariaHidden: child.getAttribute('aria-hidden'),
        count: 1,
        inert: child.inert
      })
      child.inert = true
      child.setAttribute('aria-hidden', 'true')
    }

    owned.push(child)
  }

  return () => {
    for (const element of owned) {
      const record = isolationRecords.get(element)

      if (!record) {
        continue
      }

      record.count -= 1

      if (record.count > 0) {
        continue
      }

      isolationRecords.delete(element)
      element.inert = record.inert

      if (record.ariaHidden === null) {
        element.removeAttribute('aria-hidden')
      } else {
        element.setAttribute('aria-hidden', record.ariaHidden)
      }
    }
  }
}
