import { ZONE_LIST_ID, ZONES } from './fields'

/** One shared list of zones for every zone field on the page (typing filters it). */
export function ZoneList() {
  return (
    <datalist id={ZONE_LIST_ID}>
      {ZONES.map((z) => (
        <option key={z} value={z} />
      ))}
    </datalist>
  )
}
