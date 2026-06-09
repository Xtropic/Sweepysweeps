/**
 * Calculate points for a single prediction.
 *
 * Group stage: predict home/away score. Result = W/D/L.
 * Knockout stage: predict home/away score at 90 min + optional penalty winner.
 *   - Score/result points based on 90min score.
 *   - +1 bonus if penalty winner correctly predicted (only when match went to pens).
 */
export function calculatePoints(prediction, match) {
  if (match.status !== 'completed') return null

  const { predicted_home_score: ph, predicted_away_score: pa, predicted_penalty_winner_id: ppw } = prediction
  const { home_score: ah, away_score: aa, penalty_winner_id: apw } = match

  if (ah == null || aa == null) return null

  const predictedResult = getResult(ph, pa)
  const actualResult = getResult(ah, aa)

  let points = 0

  if (ph === ah && pa === aa) {
    // Exact score
    points = 5
  } else if (predictedResult === actualResult) {
    // Correct result — check if within 1 goal on each side
    const homeDiff = Math.abs(ph - ah)
    const awayDiff = Math.abs(pa - aa)
    if (homeDiff <= 1 && awayDiff <= 1) {
      points = 3
    } else {
      points = 1
    }
  } else {
    points = 0
  }

  // Penalty winner bonus (+1) — only applies when match went to penalties
  if (apw && ppw) {
    if (ppw === apw) points += 1
  }

  return points
}

function getResult(home, away) {
  if (home > away) return 'home'
  if (away > home) return 'away'
  return 'draw'
}

export const POINTS_DESCRIPTION = [
  { label: 'Exact score', points: 5 },
  { label: 'Correct result + score within 1 goal each side', points: 3 },
  { label: 'Correct result only', points: 1 },
  { label: 'Wrong result', points: 0 },
  { label: 'Correct penalty winner (bonus)', points: '+1' },
]
