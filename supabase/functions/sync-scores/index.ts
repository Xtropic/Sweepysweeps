import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── football-data.org team name → our DB team name ───────────────────────────
// Their naming conventions differ from ours in several places
const API_NAME_MAP: Record<string, string> = {
  'USA':                    'United States',
  'Korea Republic':         'South Korea',
  "Côte d'Ivoire":          'Ivory Coast',
  'IR Iran':                'Iran',
  'Türkiye':                'Turkiye',
  'Turkey':                 'Turkiye',
  'Bosnia-Herzegovina':     'Bosnia and Herzegovina',
  'Curaçao':                'Curacao',
  'Congo DR':               'DR Congo',
  'DR Congo':               'DR Congo',
  'Czechia':                'Czech Republic',
  'Czech Republic':         'Czech Republic',
  // Pass-throughs (their name matches ours exactly — listed for clarity)
  'Mexico': 'Mexico', 'South Africa': 'South Africa',
  'Canada': 'Canada', 'Qatar': 'Qatar', 'Switzerland': 'Switzerland',
  'Brazil': 'Brazil', 'Morocco': 'Morocco', 'Haiti': 'Haiti',
  'Scotland': 'Scotland', 'Paraguay': 'Paraguay', 'Australia': 'Australia',
  'Germany': 'Germany', 'Ivory Coast': 'Ivory Coast', 'Ecuador': 'Ecuador',
  'Netherlands': 'Netherlands', 'Japan': 'Japan', 'Sweden': 'Sweden',
  'Tunisia': 'Tunisia', 'Belgium': 'Belgium', 'Egypt': 'Egypt',
  'New Zealand': 'New Zealand', 'Spain': 'Spain', 'Cape Verde': 'Cape Verde',
  'Saudi Arabia': 'Saudi Arabia', 'Uruguay': 'Uruguay', 'France': 'France',
  'Senegal': 'Senegal', 'Iraq': 'Iraq', 'Norway': 'Norway',
  'Argentina': 'Argentina', 'Algeria': 'Algeria', 'Austria': 'Austria',
  'Jordan': 'Jordan', 'Portugal': 'Portugal', 'Uzbekistan': 'Uzbekistan',
  'Colombia': 'Colombia', 'England': 'England', 'Croatia': 'Croatia',
  'Ghana': 'Ghana', 'Panama': 'Panama',
}

function mapName(apiName: string): string {
  return API_NAME_MAP[apiName] ?? apiName
}

Deno.serve(async (req) => {
  // Allow manual trigger via GET or scheduled POST
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Retrieve API key from vault ─────────────────────────────────────────
    const { data: secretRow, error: secretErr } = await supabase
      .from('vault.decrypted_secrets')
      .select('decrypted_secret')
      .eq('name', 'FOOTBALL_DATA_API_KEY')
      .single()

    if (secretErr || !secretRow) {
      return json({ error: 'API key not found in vault', detail: secretErr }, 500)
    }
    const apiKey = secretRow.decrypted_secret

    // ── Fetch all WC 2026 matches from football-data.org ───────────────────
    const fdRes = await fetch(
      'https://api.football-data.org/v4/competitions/WC/matches?season=2026',
      { headers: { 'X-Auth-Token': apiKey } }
    )
    if (!fdRes.ok) {
      const text = await fdRes.text()
      return json({ error: 'football-data.org fetch failed', status: fdRes.status, body: text }, 502)
    }
    const { matches: apiMatches } = await fdRes.json()

    // Only process finished matches
    const finished = (apiMatches ?? []).filter((m: any) => m.status === 'FINISHED')
    if (finished.length === 0) {
      return json({ message: 'No finished matches yet', total: apiMatches?.length ?? 0 })
    }

    // ── Load our DB matches (with team names) ──────────────────────────────
    const { data: dbMatches } = await supabase
      .from('matches')
      .select('id, external_match_id, status, stage, home_team_id, away_team_id, home_team:teams!matches_home_team_id_fkey(id, name), away_team:teams!matches_away_team_id_fkey(id, name)')

    const byExternalId = new Map(
      (dbMatches ?? []).filter(m => m.external_match_id).map(m => [m.external_match_id, m])
    )

    // Index by "homeName|awayName" for first-time matching
    const byTeamNames = new Map(
      (dbMatches ?? []).map(m => [
        `${m.home_team?.name}|${m.away_team?.name}`,
        m,
      ])
    )

    const results: any[] = []

    for (const am of finished) {
      const homeApiName = am.homeTeam?.name ?? ''
      const awayApiName = am.awayTeam?.name ?? ''
      const homeDbName  = mapName(homeApiName)
      const awayDbName  = mapName(awayApiName)

      // Find our match — first by stored external ID, then by team names
      let dbMatch = byExternalId.get(am.id) ?? byTeamNames.get(`${homeDbName}|${awayDbName}`)

      if (!dbMatch) {
        results.push({ skipped: true, reason: 'no DB match found', homeApiName, awayApiName })
        continue
      }

      // Skip if already marked completed with a score
      if (dbMatch.status === 'completed' && dbMatch.home_score != null) {
        // Still store external_match_id if missing
        if (!dbMatch.external_match_id) {
          await supabase.from('matches').update({ external_match_id: am.id }).eq('id', dbMatch.id)
        }
        results.push({ skipped: true, reason: 'already completed', match: dbMatch.id })
        continue
      }

      // ── Parse score ────────────────────────────────────────────────────────
      const homeScore = am.score?.fullTime?.home ?? 0
      const awayScore = am.score?.fullTime?.away ?? 0

      // Penalty winner: relevant for knockout rounds where full-time is a draw
      let penaltyWinnerId: string | null = null
      const isPenalties = am.score?.duration === 'PENALTY_SHOOTOUT'
      if (isPenalties) {
        const penHome = am.score?.penalties?.home ?? 0
        const penAway = am.score?.penalties?.away ?? 0
        penaltyWinnerId = penHome > penAway ? dbMatch.home_team_id : dbMatch.away_team_id
      }

      // ── Write to DB ────────────────────────────────────────────────────────
      const { error: updateErr } = await supabase
        .from('matches')
        .update({
          external_match_id:  am.id,
          home_score:         homeScore,
          away_score:         awayScore,
          penalty_winner_id:  penaltyWinnerId,
          status:             'completed',
        })
        .eq('id', dbMatch.id)

      if (updateErr) {
        results.push({ error: updateErr.message, match: dbMatch.id })
        continue
      }

      // ── Recalculate predictions for this match ─────────────────────────────
      const { error: rpcErr } = await supabase.rpc('recalculate_match_predictions', {
        p_match_id: dbMatch.id,
      })

      results.push({
        updated:    true,
        match:      dbMatch.id,
        home:       homeDbName,
        away:       awayDbName,
        score:      `${homeScore}–${awayScore}`,
        penalties:  isPenalties,
        rpcError:   rpcErr?.message ?? null,
      })
    }

    return json({ synced: results.filter(r => r.updated).length, total: finished.length, results })

  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
