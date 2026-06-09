import { TEAM_FLAGS } from '../lib/teams'

const sizes = { sm: 20, md: 28, lg: 40 }

export default function Flag({ teamName, size = 'md', className = '' }) {
  const code = TEAM_FLAGS[teamName]
  const px = sizes[size] ?? sizes.md

  if (!code) {
    return (
      <span
        className={`fi ${className}`}
        style={{
          width: px,
          height: Math.round(px * 0.75),
          display: 'inline-block',
          background: '#E8E0CC',
          borderRadius: 3,
          flexShrink: 0,
        }}
      />
    )
  }

  return (
    <span
      className={`fi fi-${code} ${className}`}
      style={{
        width: px,
        height: Math.round(px * 0.75),
        display: 'inline-block',
        borderRadius: 3,
        flexShrink: 0,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      title={teamName}
    />
  )
}
