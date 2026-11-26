import { Link } from 'react-router'
import { CONTACT_EMAIL, LegalLayout } from './LegalLayout'

/**
 * The full privacy policy. Keep it true to the code: when what we store or who we send it to
 * changes, change this page in the same pull request (and the short notice in PrivacyStep).
 */
export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy policy">
      <p>
        Voxlace learns how you write from your own posts and drafts posts for X, LinkedIn and
        Telegram. This page says what we keep, why, who else sees it and how to delete it. Voxlace
        is run by its two developers; "we" means them.
      </p>

      <h2>What we keep</h2>
      <ul>
        <li>
          <b>Your account:</b> your email address, a name if you give one, your time zone and
          language. If you sign in with Google, Google gives us your name and email address and
          nothing else.
        </li>
        <li>
          <b>Your own posts:</b> the text and dates of posts from the X, LinkedIn or Telegram
          exports you upload, and a numeric summary of each post (an "embedding") used to find your
          most similar posts. We skip reposts, forwards and other people's messages.
        </li>
        <li>
          <b>What you write in Voxlace:</b> check-ins, your profile, the text of a resume after
          phone numbers, email addresses and street addresses are removed, chats, drafts and when
          you plan to post them.
        </li>
        <li>
          <b>Prompt logs:</b> for each draft, the exact instructions sent to the AI and which model
          wrote it, so we can explain and fix a bad draft.
        </li>
        <li>
          <b>Connections you choose to add:</b> a GitHub connection (your own commits, pull requests
          and releases, never code), the Telegram channel you connect to our bot, and your own AI
          keys, which are stored encrypted and only ever shown masked.
        </li>
        <li>
          <b>Usage counts:</b> how many drafts you made today, so we can apply the daily limit.
        </li>
      </ul>
      <p>
        <b>Your export file is read once and deleted.</b> We never keep the uploaded file, and we
        only read the posts in it.
      </p>

      <h2>What we don't do</h2>
      <ul>
        <li>We never sell your data or use it for advertising.</li>
        <li>We never train an AI model on your posts.</li>
        <li>We never ask for your social media passwords and never scrape your accounts.</li>
        <li>We never post anything you haven't approved.</li>
        <li>We don't use analytics or advertising trackers, and our fonts are served by us.</li>
        <li>Other Voxlace users can never see your posts, drafts or profile.</li>
      </ul>

      <h2>Who else processes your data</h2>
      <p>To run Voxlace we rely on these services. Each gets only what it needs:</p>
      <ul>
        <li>
          <b>Supabase</b> handles login: your email address, a protected (hashed) password, or your
          Google sign-in.
        </li>
        <li>
          <b>Contabo</b> rents us the server that runs Voxlace and stores its database.
        </li>
        <li>
          <b>Google (Gemini API)</b> reads your posts, check-ins and profile to learn your voice and
          write drafts. We use Google's free tier, under which{' '}
          <b>Google may use what we send to improve its products</b>. Don't put anything in Voxlace
          you wouldn't want processed on those terms.
        </li>
        <li>
          <b>Groq</b> writes the draft instead when Gemini is busy, from the same text.
        </li>
        <li>
          <b>The AI provider of a key you add</b> (Google, Groq, OpenAI, Anthropic, OpenRouter or
          Mistral) writes your drafts under that provider's own terms.
        </li>
        <li>
          <b>GitHub</b> and <b>Telegram</b>, only if you connect them: we read your GitHub activity
          and our Telegram bot posts approved drafts to your channel.
        </li>
      </ul>

      <h2>Trying Voxlace without an account</h2>
      <p>
        Without an account, what you type is sent to the AI to write the drafts, and the drafts stay
        in your browser. We keep only a daily count per hashed IP address to apply the guest limit.
        When you sign up, the drafts in that browser move into your account.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>
          <b>Download everything:</b> Profile → Settings → Export gives you all your data as a file.
        </li>
        <li>
          <b>Delete everything:</b> Profile → Settings → Delete account removes your posts,
          embeddings, drafts, profile, connections and keys at once. To also remove your login
          record, email us.
        </li>
        <li>
          <b>Disconnect</b> GitHub or Telegram, or remove an AI key, at any time in Profile. Their
          data goes with them.
        </li>
      </ul>
      <p>
        We keep your data until you delete it or your account. Logs on the server don't contain the
        text of your posts or prompts.
      </p>

      <h2>Google user data</h2>
      <p>
        If you sign in with Google, we use your Google name and email address only to create and
        sign in to your Voxlace account. We don't share them, don't use them for anything else and
        don't ask for access to your Gmail, Drive or any other Google data. Our use of information
        received from Google follows the{' '}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          className="text-thread underline underline-offset-4"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2>Children</h2>
      <p>Voxlace is not for anyone under 16.</p>

      <h2>Changes</h2>
      <p>
        If we change this policy, we update the date at the top. If a change affects what we do with
        data you already gave us, we tell you in the app first. The{' '}
        <Link to="/terms" className="text-thread underline underline-offset-4">
          terms of use
        </Link>{' '}
        say how you may use Voxlace. Write to {CONTACT_EMAIL} with any question or request.
      </p>
    </LegalLayout>
  )
}
