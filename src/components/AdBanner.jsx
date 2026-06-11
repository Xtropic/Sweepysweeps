import { useEffect, useRef } from 'react'

// HOW TO ACTIVATE REAL ADS:
//  1. Sign up at https://adsense.google.com and get your publisher ID
//  2. Add your site and wait for approval (~1–3 days)
//  3. Create ad units in your AdSense dashboard
//  4. Set VITE_ADSENSE_CLIENT in your .env AND in Vercel's Environment Variables:
//       VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXXX
//  5. Replace the slot="" prop values in each page with your real ad slot IDs
//  Sizes:
//  leaderboard  — 728×90   (desktop top/bottom strip)
//  rectangle    — 336×280  (sidebar / between content)
//  mobile       — 320×50   (mobile bottom strip)
//  responsive   — 100%×auto (adapts to container — recommended)

const SIZES = {
  leaderboard: { width: 728, height: 90 },
  rectangle:   { width: 336, height: 280 },
  mobile:      { width: 320, height: 50 },
  responsive:  { width: '100%', height: 90 },
}

const CLIENT   = import.meta.env.VITE_ADSENSE_CLIENT
const ADS_LIVE = import.meta.env.VITE_ADS_LIVE === 'true'

// Inject the AdSense <script> once into <head> when the client ID is available.
// Using a module-level flag so multiple AdBanner instances don't duplicate it.
let scriptInjected = false
function ensureAdSenseScript(clientId) {
  if (scriptInjected || !clientId) return
  if (document.querySelector('script[data-adsense]')) { scriptInjected = true; return }
  const s = document.createElement('script')
  s.async = true
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`
  s.crossOrigin = 'anonymous'
  s.setAttribute('data-adsense', '1')
  document.head.appendChild(s)
  scriptInjected = true
}

export default function AdBanner({ slot, size = 'responsive', style = {} }) {
  const adRef  = useRef(null)
  const pushed = useRef(false)
  const { width, height } = SIZES[size] ?? SIZES.responsive
  const adsReady = !!CLIENT && !!slot && ADS_LIVE

  useEffect(() => {
    if (!adsReady) return
    ensureAdSenseScript(CLIENT)
    if (pushed.current) return
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
      pushed.current = true
    } catch (e) {
      console.warn('AdSense push failed:', e)
    }
  }, [adsReady])

  if (!adsReady) return null

  // ── Real AdSense unit ────────────────────────────────────────────────────
  return (
    <div style={{ textAlign: 'center', overflow: 'hidden', ...style }}>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{
          display: 'block',
          width: typeof width === 'number' ? width : '100%',
          height: typeof height === 'number' ? height : 'auto',
        }}
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format={size === 'responsive' ? 'auto' : undefined}
        data-full-width-responsive={size === 'responsive' ? 'true' : undefined}
      />
    </div>
  )
}
