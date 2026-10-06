// store/json.ts — the two questions every reader of saved data asks of a value it has just parsed.
// Saved data is untrusted (an older build, the other site on this origin, a truncated write), so each
// reader checks the shape it is about to walk; these are the one spelling of those checks.

/** A plain keyed object — not null, and not an array (whose "keys" are positions). */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Do two JSON values say the same thing? Deep, and blind to the ORDER of an object's keys — nothing
 * guarantees key order across a save and a load, or between two builds writing one key — so it is
 * not a comparison of their text.
 * ⚠ NaN COMPARES FALSE (`a === b` fails and no branch rescues it), which is the safe direction for
 * every caller: a number that cannot be a stored value never counts as "the same".
 */
export const sameJson = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => sameJson(v, b[i]))
    )
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every((k) => k in right && sameJson(left[k], right[k]))
  )
}
