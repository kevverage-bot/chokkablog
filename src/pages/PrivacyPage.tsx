import { COLORS } from '../constants/colors'
import { Container } from '../components/Container'

/**
 * The privacy notice.
 *
 * ⚠ THIS PAGE HAS TO STAY TRUE, and it is the one page on the site that goes
 * stale by someone changing code elsewhere. It names every processor the site
 * actually uses; adding an analytics script, an embed, a mailing tool or a
 * third-party font means editing this page in the same commit. A notice that
 * lists yesterday's processors is worse than none, because it is a statement of
 * fact that is now wrong.
 *
 * ⚠ AND IT IS LOAD-BEARING FOR THE SIGN-UP BOX. components/SubscribeBox.tsx
 * links here at the point of collection, which is where UK GDPR expects the
 * information to be. Removing this page breaks that link and the promise with it.
 *
 * Not legal advice, and not written by a lawyer — it is an honest description of
 * what the site does, which is what the ICO asks a small publisher for.
 */

/** Reviewed by hand. Bump it when the substance changes, not when the wording is
 *  tidied — a date that moves for typos tells a reader nothing. */
const LAST_UPDATED = '19 August 2026'

/**
 * ⚠ THIS ADDRESS MUST ACTUALLY BE READ. A notice naming a contact route that
 * bounces — or that nobody looks at — is worse than one that gives none, because
 * it is a published promise rather than an omission.
 *
 * It is the existing chokkablog.com mailbox rather than a dedicated `privacy@`
 * for a plain reason: GoDaddy's Microsoft 365 plan here has no spare licence, so
 * a separate address would have to be bought. Nothing in UK data protection law
 * asks for a particular name in front of the @ — only a route that works.
 */
const CONTACT = 'kevin@chokkablog.com'

export function PrivacyPage() {
  return (
    <Container className="py-10 sm:py-14">
      <h1
        className="text-3xl sm:text-4xl font-extrabold leading-tight m-0"
        style={{ color: COLORS.ink, letterSpacing: '-1px' }}
      >
        Privacy
      </h1>
      <p className="text-xs mt-3 mb-8" style={{ color: COLORS.faint }}>
        Last updated {LAST_UPDATED}
      </p>

      <div className="text-[17px] leading-[1.7]" style={{ color: COLORS.ink }}>
        <P>
          chokkablog is written and run by Kevin Hague as an individual. For the
          purposes of UK data protection law I am the data controller for
          everything described below, and you can reach me at{' '}
          <Mail />.
        </P>

        <P>
          The short version: this site sells nothing, advertises nothing, and
          tracks nobody across the internet. It collects personal data in exactly
          three places — the comment form, the feedback form and the email sign-up
          — and in each case only because you typed something into it.
        </P>

        <H2>Reading the site</H2>
        <P>
          You can read every post here without giving me anything. Page views are
          counted by Vercel Analytics, which is aggregate and cookieless: it
          records that a page was viewed, not who viewed it, and does not follow
          you to any other site. There are no advertising or tracking cookies of
          any kind.
        </P>
        <P>
          My web host keeps ordinary server logs, including IP addresses, for
          security and troubleshooting, as every web host does.
        </P>

        <H2>Comments</H2>
        <P>
          If you leave a comment I ask for a name, an email address and the
          comment itself. <strong>Your name and your comment are published; your
          email address never is.</strong> I ask for the address so there is a
          real person behind a comment and so I can reply to you directly rather
          than in public. Comments are read before they appear.
        </P>

        <H2>The feedback form</H2>
        <P>
          The form in the footer sends me your message and, if you choose to give
          them, your name and email address — both are optional, because plenty
          of people want to point out a wrong number without starting a
          correspondence. It also sends the address of the page you were on, so I
          can see what you were looking at.
        </P>

        <H2>Email sign-up</H2>
        <P>
          If you sign up for new-post emails I collect your email address and
          nothing else. You will be sent a confirmation email first, and you are
          not on the list until you click the link in it. The list is run by{' '}
          <Ext href="https://kit.com/">Kit</Ext>, an email platform based in the
          United States; your address is stored by them and by me. Every email
          has an unsubscribe link, which works immediately and without asking me.
        </P>
        <P>
          I keep my own record of the fact that you signed up, when, and from
          which page. That is the record that shows your consent was given, and
          it is also what lets me move to a different email provider one day
          without losing the list.
        </P>

        <H2>Spam protection</H2>
        <P>
          All three forms are protected by{' '}
          <Ext href="https://www.hcaptcha.com/privacy">hCaptcha</Ext>, which
          receives your IP address and some information about your browser in
          order to tell a person from a script.
        </P>
        <P>
          To stop one sender flooding a form, I record a <em>salted hash</em> of
          the IP address alongside each submission rather than the address
          itself — enough to count how many messages came from the same place in
          an hour, not enough to work out where that was.
        </P>

        <H2>The archive</H2>
        <P>
          The posts at <a href="/archive" style={{ color: COLORS.accent }}>/archive</a>{' '}
          are the old chokkablog.blogspot.com, rehosted here so that thirteen
          years of writing and the discussion under it stay readable. They
          include comments made on the original blog, under whatever name each
          commenter used at the time. Nothing there is new collection — it is the
          same material, at a more durable address — but if a comment of yours is
          in it and you would rather it were not, write to me and I will remove
          it.
        </P>

        <H2>Who else handles it</H2>
        <P>These are the only companies involved in running the site:</P>
        <ul className="list-disc pl-6 space-y-1 my-4">
          <Li><Ext href="https://supabase.com/privacy">Supabase</Ext> — the database everything is stored in</Li>
          <Li><Ext href="https://vercel.com/legal/privacy-policy">Vercel</Ext> — hosting and the page-view counts</Li>
          <Li><Ext href="https://kit.com/privacy">Kit</Ext> — the email list</Li>
          <Li><Ext href="https://www.hcaptcha.com/privacy">hCaptcha</Ext> — spam protection on the forms</Li>
          <Li><Ext href="https://resend.com/legal/privacy-policy">Resend</Ext> — sends me an alert when someone uses a form</Li>
        </ul>
        <P>
          Some of these are based outside the UK, which means your data may be
          handled in another country under the safeguards those companies
          provide. I do not sell anything to anyone, and I do not share your
          details with anybody who is not on that list.
        </P>

        <H2>How long I keep it</H2>
        <P>
          Comments stay as long as the post they are on. Feedback is kept so I
          have a record of what has been reported and fixed. Your email address
          stays on the list until you unsubscribe or ask me to remove it, at
          which point it goes from both Kit and my own copy.
        </P>

        <H2>Your rights</H2>
        <P>
          You can ask me what I hold about you, ask me to correct it, or ask me
          to delete it, and I will do it. Write to <Mail />. There is no form to
          fill in and I will not ask you to prove anything beyond enough to be
          sure it is your data.
        </P>
        <P>
          If you think I have handled your data badly, you can complain to the{' '}
          <Ext href="https://ico.org.uk/make-a-complaint/">
            Information Commissioner's Office
          </Ext>
          , the UK regulator. I would rather you told me first, but it is your
          right either way.
        </P>

        <H2>Changes</H2>
        <P>
          If this changes I will update the date at the top. If it changes in a
          way that affects anyone on the email list, I will say so in an email
          rather than quietly editing the page.
        </P>
      </div>
    </Container>
  )
}

/* ── Small presentational helpers, so the prose above stays readable ── */

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-4">{children}</p>
}

function Li({ children }: { children: React.ReactNode }) {
  return <li>{children}</li>
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[11px] font-semibold uppercase mt-10 mb-3"
      style={{ color: COLORS.accent, letterSpacing: '2px' }}
    >
      {children}
    </h2>
  )
}

function Mail() {
  return (
    <a href={`mailto:${CONTACT}`} style={{ color: COLORS.accent }}>{CONTACT}</a>
  )
}

/** Every third party named here is linked to its own notice, so a reader can
 *  check what I say about it rather than take my word. `noopener` because
 *  `target=_blank` without it hands the opened page a handle on this one. */
function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: COLORS.accent }}
    >
      {children}
    </a>
  )
}
