import { useEffect, useRef } from 'react'

/**
 * AdBanner — Google AdSense wrapper with a styled placeholder fallback.
 *
 * HOW TO ACTIVATE REAL ADS:
 *  1. Sign up at https://adsense.google.com
 *  2. Add your site and wait for approval (~1–3 days)
 *  3. Create ad units in your AdSense dashboard
 *  4. Set VITE_ADSENSE_CLIENT in your .env file:
 *       VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXXX
 *  5. Replace the slot prop values in each page with your real ad slot IDs
 *
 * Until then the component renders a clearly-labelled placeholder banner.
 *
 * Sizes:
 *  leaderboard  — 728×90   (desktop top/bottom strip)
 *  rectangle    — 336×280  (sidebar / between content)
 *  mobile       — 320×50   (mobile bottom strip)
 *  responsive   — 100%×auto (adapts to container — recommended)
 */

const SIZES = {
  leaderboard: { width: 728, height: 90 },
  rectangle:   { width: 336, height: 280 },
  mobile:      { width: 320, height: 50 },
  responsive:  { width: '100%', height: 90 },
}

const CLIENT = import.meta.env.VITE_ADSENSE_CLIENT // e.g. ca-pub-XXXXXXXXXXXXXXXXX

export default function AdBanner({ slot, size = 'responsive', style = {} }) {
  const adRef  = useRef(null)
  const pushed = useRef(false)
  const { width, height } = SIZES[size] ?? SIZES.responsive
  const adsReady = !!CLIENT && !!slot

  useEffect(() => {
    if (!adsReady || pushed.current) return
    try {
      // Push the ad unit once the component mounts
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
      pushed.current = true
    } catch (e) {
      console.warn('AdSense push failed:', e)
    }
  }, [adsReady])

  // ── Placeholder (shown until AdSense is configured) ──────────────────────
  if (!adsReady) {
    return (
      <div
        style={{
          width: typeof width === 'number' ? width : '100%',
          height: typeof height === 'number' ? height : 90,
          background: 'linear-gradient(135deg, #0D1B2A 0%, #1A2E42 100%)',
          border: '1px dashed rgba(212,160,23,0.4)',
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          cursor: 'pointer',
          overflow: 'hidden',
          position: 'relative',
          ...style,
        }}
        onClick={() => window.open('https://adsense.google.com', '_blank')}
        title="Click to set up Google AdSense"
      >
        {/* Subtle shimmer effect */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, transparent 0%, rgba(212,160,23,0.05) 50%, transparent 100%)',
          animation: 'shimmer 2.5s ease-in-out infinite',
        }} />
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(212,160,23,0.6)', textTransform: 'uppercase', zIndex: 1 }}>
          Advertisement
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', zIndex: 1 }}>
          Your ad could be here
        </div>
        <div style={{ fontSize: 10, color: 'rgba(212,160,23,0.4)', zIndex: 1 }}>
          Powered by Google AdSense
        </div>
      </div>
    )
  }

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
