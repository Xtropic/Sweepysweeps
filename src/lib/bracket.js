export const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']

// 8 fixed R32 matchups between group 1st/2nd place finishers (Matches 73,75,76,78,83,84,86,88)
export const R32_FIXED_SLOTS = [
  { slot: 0,  home: '2A', away: '2B' },  // M73
  { slot: 2,  home: '1F', away: '2C' },  // M75
  { slot: 3,  home: '1C', away: '2F' },  // M76
  { slot: 5,  home: '2E', away: '2I' },  // M78
  { slot: 10, home: '2K', away: '2L' },  // M83
  { slot: 11, home: '1H', away: '2J' },  // M84
  { slot: 13, home: '1J', away: '2H' },  // M86
  { slot: 15, home: '2D', away: '2G' },  // M88
]

// 8 R32 matchups where a group winner faces one of the 8 best 3rd-place qualifiers
// The specific 3rd-place opponent depends on which groups produce the 8 qualifiers (user picks)
export const R32_3RD_SLOTS = [
  { slot: 1,  winner: '1E' },  // M74
  { slot: 4,  winner: '1I' },  // M77
  { slot: 6,  winner: '1A' },  // M79
  { slot: 7,  winner: '1L' },  // M80
  { slot: 8,  winner: '1D' },  // M81
  { slot: 9,  winner: '1G' },  // M82
  { slot: 12, winner: '1B' },  // M85
  { slot: 14, winner: '1K' },  // M87
]

// Which two R32 slots feed into each R16 slot (non-sequential — official FIFA bracket draw)
export const R16_FROM_R32 = {
  0: [1, 4],   // M89: W(M74) vs W(M77)
  1: [0, 2],   // M90: W(M73) vs W(M75)
  2: [3, 5],   // M91: W(M76) vs W(M78)
  3: [6, 7],   // M92: W(M79) vs W(M80)
  4: [10, 11], // M93: W(M83) vs W(M84)
  5: [8, 9],   // M94: W(M81) vs W(M82)
  6: [13, 15], // M95: W(M86) vs W(M88)
  7: [12, 14], // M96: W(M85) vs W(M87)
}

// Which two R16 slots feed into each QF slot (non-sequential)
export const QF_FROM_R16 = {
  0: [0, 1],  // M97: W(M89) vs W(M90)
  1: [4, 5],  // M98: W(M93) vs W(M94)
  2: [2, 3],  // M99: W(M91) vs W(M92)
  3: [6, 7],  // M100: W(M95) vs W(M96)
}
// SF and Final use sequential slot*2 / slot*2+1 (both correct as-is)

export const KNOCKOUT_STAGES = ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'final']

export const STAGE_LABELS = {
  round_of_32:   'Round of 32',
  round_of_16:   'Round of 16',
  quarter_final: 'Quarter-finals',
  semi_final:    'Semi-finals',
  final:         'Final',
}

export const BRACKET_POINTS = { group_position: 2, knockout_winner: 5 }

export function parseSlot(s) {
  return { pos: parseInt(s[0]), group: s.slice(1) }
}

export function resolveSlot(slotDesc, groupPicks) {
  const { pos, group } = parseSlot(slotDesc)
  return groupPicks[group]?.[pos] ?? null
}

export function buildR32Matchups(groupPicks) {
  return R32_FIXED_SLOTS.map(({ slot, home, away }) => ({
    slot, home, away,
    homeTeam: resolveSlot(home, groupPicks),
    awayTeam: resolveSlot(away, groupPicks),
  }))
}

export function calcBracketPoints({ groupPicks, knockoutPicks, actualGroupStandings, actualKnockoutWinners }) {
  let pts = 0
  for (const group of GROUPS) {
    const predicted = groupPicks[group] || {}
    const actual = actualGroupStandings[group] || {}
    for (let pos = 1; pos <= 4; pos++) {
      if (predicted[pos] && actual[pos] && predicted[pos].id === actual[pos].id) {
        pts += BRACKET_POINTS.group_position
      }
    }
  }
  for (const [key, teamId] of Object.entries(knockoutPicks)) {
    if (actualKnockoutWinners[key] === teamId) pts += BRACKET_POINTS.knockout_winner
  }
  return pts
}
