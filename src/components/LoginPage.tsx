import { useRef, useState } from 'react'
import HCaptcha from '@hcaptcha/react-hcaptcha'
import { supabase } from '../lib/supabase'
import { COLORS } from '../constants/colors'

/**
 * Sign-in, for the author. There is no public sign-up: accounts are created in
 * the Supabase dashboard, and `profiles.role` is admin-writable only (see
 * supabase/001_profiles.sql), so there is no path from "anyone" to "admin".
 *
 * The captcha is optional at build time but not at runtime: if
 * VITE_HCAPTCHA_SITE_KEY is set here, the matching SECRET must be configured in
 * Supabase Auth > Attack Protection, or `signInWithPassword` rejects every
 * attempt. Set both or neither.
 */
const HCAPTCHA_SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const captchaRef = useRef<HCaptcha>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (HCAPTCHA_SITE_KEY && !captchaToken) {
      setError('Please complete the captcha.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: HCAPTCHA_SITE_KEY ? { captchaToken: captchaToken! } : undefined,
    })

    if (error) {
      setError(error.message)
      // A token is single-use, so a failed attempt must not silently reuse it —
      // the second try would fail on the captcha rather than the password, which
      // is a confusing way to be told you mistyped.
      captchaRef.current?.resetCaptcha()
      setCaptchaToken(null)
    }
    setLoading(false)
  }

  const inputCls = 'w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2'

  return (
    <div className="max-w-sm mx-auto px-5 py-16">
      <h1 className="text-2xl font-extrabold mb-1" style={{ color: COLORS.ink, letterSpacing: '-0.5px' }}>
        Sign in
      </h1>
      <p className="text-sm mb-6" style={{ color: COLORS.muted }}>
        Author access to chokkablog.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1" style={{ color: COLORS.ink }}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputCls}
            style={{ borderColor: COLORS.border }}
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1" style={{ color: COLORS.ink }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={inputCls}
            style={{ borderColor: COLORS.border }}
          />
        </div>

        {HCAPTCHA_SITE_KEY && (
          <div className="flex justify-center">
            <HCaptcha
              ref={captchaRef}
              sitekey={HCAPTCHA_SITE_KEY}
              onVerify={(token) => setCaptchaToken(token)}
              onExpire={() => setCaptchaToken(null)}
            />
          </div>
        )}

        {error && (
          <p className="text-sm" role="alert" style={{ color: COLORS.negative }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 rounded-md text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: COLORS.ink }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
