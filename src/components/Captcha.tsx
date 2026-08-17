import { lazy, Suspense } from 'react'
import { COLORS } from '../constants/colors'
import { HCAPTCHA_SITE_KEY } from '../lib/captcha'

/**
 * Split out of the main bundle. The widget is ~10 kB gzipped of third-party
 * JavaScript that every reader would otherwise download to read a post, and only
 * the few who write something ever need it. It loads when a form opens.
 */
const HCaptcha = lazy(() => import('@hcaptcha/react-hcaptcha'))

/**
 * The captcha, and the token it produces.
 *
 * ⚠ To RESET this after a failed submission, change its `key` rather than
 * reaching for the widget's imperative API: a verified token cannot be replayed,
 * so a retry needs a fresh one, and remounting is the one reset that cannot end
 * up half-applied. Both forms do that with an attempt counter.
 */
export function Captcha({ onToken }: { onToken: (token: string | null) => void }) {
  if (!HCAPTCHA_SITE_KEY) return null
  return (
    <div className="flex justify-center">
      <Suspense
        fallback={<p className="text-xs m-0" style={{ color: COLORS.faint }}>Loading the captcha…</p>}
      >
        <HCaptcha
          sitekey={HCAPTCHA_SITE_KEY}
          onVerify={(token) => onToken(token)}
          onExpire={() => onToken(null)}
          onError={() => onToken(null)}
        />
      </Suspense>
    </div>
  )
}
