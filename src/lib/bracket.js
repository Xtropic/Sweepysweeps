// WC 2026 bracket structure
// 32 teams: top 2 from each of 12 groups (24) + 8 best 3rd-place teams

export const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']

// R32 matchups for 1st/2nd place qualifiers (24 slots, slots 0-11)
// Paired within group pods: A-B, C-D, E-F, G-H, I-J, K-L
export const R32_FIXED_SLOTS = [
  { slot: 0,  home: '1A', away: '2B' },
  { slot: 1,  home: '1B', away: '2A' },
  { slot: 2,  home: '1C', away: '2D' },
  { slot: 3,  home: '1D', away: '2C' },
  { slot: 4,  home: '1E', away: '2F' },
  { slot: 5,  home: '1F', away: '2E' },
  { slot: 6,  home: '1G', away: '2H' },
  { slot: 7,  home: '1H', away: '2G' },
  { slot: 8,  home: '1I', away: '2J' },
  { slot: 9,  home: '1J', away: '2I' },
  { slot: 10, home: '1K', away: '2L' },
  { slot: 11, home: '1L', away: '2K' },
]

// 8 slots for best 3rd-place teams (slots 12-19)
// Each slot pairs a 3rd-place qualifier against the loser slot of a fixed R32 match
// For bracket prediction purposes users just pick the 3rd-place team for each slot
export const R32_THIRD_PLACE_SLOTS = [
  { slot: 12, vsLabel: 'Best 3rd #1' },
  { slot: 13, vsLabel: 'Best 3rd #2' },
  { slot: 14, vsLabel: 'Best 3rd #3' },
  { slot: 15, vsLabel: 'Best 3rd #4' },
  { slot: 16, vsLabel: 'Best 3rd #5' },
  { slot: 17, vsLabel: 'Best 3rd #6' },
  { slot: 18, vsLabel: 'Best 3rd #7' },
  { slot: 19, vsLabel: 'Best 3rd #8' },
]

export const KNOCKOUT_STAGES = ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'final']

export const STAGE_LABELS = {
  round_of_32:   'Round of 32',
  round_of_16:   'Round of 16',
  quarter_final: 'Quarter-finals',
  semi_final:    'Semi-finals',
  final:         'Final',
}

export const BRACKET_POINTS = {
  group_position: 2,
  knockout_winner: 5,
}

// Derive position label from slot descriptor e.g. '1A' → { pos: 1, group: 'A' }
export function parseSlot(s) {
  return { pos: parseInt(s[0]), group: s.slice(1) }
}

// Resolve which team a user picked for a given slot descriptor
// groupPicks: { [group]: { 1: teamObj, 2: teamObj, 3: teamObj, 4: teamObj } }
export function resolveSlot(slotDesc, groupPicks) {
  const { pos, group } = parseSlot(slotDesc)
  return groupPicks[group]?.[pos] ?? null
}

// Build the R32 matchup list with resolved team objects
export function buildR32Matchups(groupPicks) {
  return R32_FIXED_SLOTS.map(({ slot, home, away }) => ({
    slot,
    homeTeam: resolveSlot(home, groupPicks),
    awayTeam: resolveSlot(away, groupPicks),
    homeLabel: home,
    awayLabel: away,
  }))
}

// Calculate points for a user's bracket predictions vs actual results
export function calcBracketPoints({ groupPicks, knockoutPicks, actualGroupStandings, actualKnockoutWinners }) {
  let pts = 0

  // Group stage: 2 pts per correct position
  for (const group of GROUPS) {
    const predicted = groupPicks[group] || {}
    const actual = actualGroupStandings[group] || {}
    for (let pos = 1; pos <= 4; pos++) {
      if (predicted[pos] && actual[pos] && predicted[pos].id === actual[pos].id) {
        pts += BRACKET_POINTS.group_position
      }
    }
  }

  // Knockout: 5 pts per correct winner
  for (const [key, teamId] of Object.entries(knockoutPicks)) {
    if (actualKnockoutWinners[key] && actualKnockoutWinners[key] === teamId) {
      pts += BRACKET_POINTS.knockout_winner
    }
  }

  return pts
}
