import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Join class names; a later Tailwind class wins over an earlier one of the same kind, so a
 * component's defaults can be overridden with `className` (shadcn/ui's helper).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
