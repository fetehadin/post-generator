import { Link } from 'react-router'
import { LegalLayout } from './LegalLayout'

/** Terms of use for the beta. Plain words; keep them in step with what the app does. */
export function TermsPage() {
  return (
    <LegalLayout title="Terms of use">
      <p>
        These terms apply when you use Voxlace at voxlace.fetehadin.com. By creating an account or
        drafting without one, you agree to them.
      </p>

      <h2>Voxlace is in beta</h2>
      <p>
        Voxlace is free and still being built. Features may change, break or go away, and the
        service may be down at times. It is provided "as is", without any promise that it will be
        available, error-free or right for a particular purpose.
      </p>

      <h2>Your content stays yours</h2>
      <p>
        You own your posts, check-ins and the drafts Voxlace writes for you. You give us permission
        to store and process them only to run Voxlace for you, as the{' '}
        <Link to="/privacy" className="text-thread underline underline-offset-4">
          privacy policy
        </Link>{' '}
        describes. Only upload posts you wrote yourself.
      </p>

      <h2>You decide what gets posted</h2>
      <p>
        Drafts are written by AI and can be wrong. Read every draft before you approve it: you are
        responsible for what you post and for following the rules of X, LinkedIn and Telegram.
        Voxlace never posts anything you haven't approved.
      </p>

      <h2>Fair use</h2>
      <ul>
        <li>Don't use Voxlace for spam, scams, harassment or to pretend to be someone else.</li>
        <li>
          Don't try to reach other users' data, get around the limits or overload the service.
        </li>
        <li>Keep your login to yourself. One account per person.</li>
        <li>You must be at least 16 years old.</li>
      </ul>
      <p>We may limit, suspend or close an account that breaks these rules.</p>

      <h2>Your own AI keys</h2>
      <p>
        If you add an API key from an AI provider, drafts made with it run under that provider's
        terms and any costs on that key are yours.
      </p>

      <h2>Ending</h2>
      <p>
        You can delete your account at any time in Profile → Settings. We may end the beta or
        Voxlace itself; if we do, we will tell you in advance so you can export your data.
      </p>

      <h2>Liability</h2>
      <p>
        As far as the law allows, we are not liable for indirect losses, lost posts, lost reach or
        anything that results from content you approved and posted.
      </p>

      <h2>Changes</h2>
      <p>
        If we change these terms, we update the date at the top and tell you in the app when the
        change matters to you. Using Voxlace after that means you accept the new terms.
      </p>
    </LegalLayout>
  )
}
