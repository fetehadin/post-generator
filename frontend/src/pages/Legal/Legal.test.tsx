import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { render as prerender } from '../../prerender'
import { CONTACT_EMAIL } from './LegalLayout'
import { PrivacyPage } from './PrivacyPage'
import { TermsPage } from './TermsPage'

const at = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('legal pages (FR-37)', () => {
  it('privacy names every outside service that gets user data, and Google Limited Use', () => {
    at(<PrivacyPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeInTheDocument()
    for (const name of [
      'Supabase',
      'Contabo',
      'Google (Gemini API)',
      'Groq',
      'GitHub',
      'Telegram',
    ]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0)
    }
    expect(screen.getByRole('link', { name: /User Data Policy/ })).toHaveAttribute(
      'href',
      'https://developers.google.com/terms/api-services-user-data-policy',
    )
  })

  it('both pages link to each other and give a contact address', () => {
    at(<TermsPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of use' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'privacy policy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: CONTACT_EMAIL })).toHaveAttribute(
      'href',
      `mailto:${CONTACT_EMAIL}`,
    )
  })

  it('the prerendered homepage names Voxlace, says what it does and links to privacy', () => {
    // dist/index.html, which Google's OAuth branding check reads without running JavaScript.
    const html = prerender('home')
    const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
    expect(text).toContain('Voxlace')
    expect(text).toContain(
      'Voxlace learns how you write from your own posts and drafts new ones for you.',
    )
    expect(text).toContain('Posts for X, LinkedIn and Telegram, written in your own voice.')
    expect(html).toContain('href="/privacy"')
    expect(html).toContain('href="/terms"')
    expect(html).toContain('href="/login"')
    expect(html).toContain('data-prerendered="home"')
  })
})
