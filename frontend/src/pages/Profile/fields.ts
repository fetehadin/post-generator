/** Shared Profile form styles, so the newer tabs look like About you. */
export const input =
  'mt-1 block min-h-10 w-full rounded-control border border-edge bg-surface px-3 text-sm'
export const primaryButton =
  'inline-flex min-h-10 items-center rounded-control bg-primary px-4 text-sm font-semibold text-on-primary disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted'

/** Every IANA zone the browser knows, for the time-zone search (a datalist). */
export const ZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return []
  }
})()
export const ZONE_LIST_ID = 'voxlace-zones'
