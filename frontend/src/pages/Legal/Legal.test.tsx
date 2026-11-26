import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
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
})
