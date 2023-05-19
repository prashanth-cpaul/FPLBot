enum CHIP {
  BENCH_BOOST = 'bboost',
  TRIPLE_CAPTAIN = '3xc',
}

interface ChipPlay {
  chip_name: CHIP
  num_played: number
}

interface TopElementInfo {
  id: number
  points: number
}

interface Event {
  id: number
  name: string
  deadline_time: string
  average_entry_score: number
  finished: boolean
  data_checked: boolean
  highest_scoring_entry: number | null
  deadline_time_epoch: number
  deadline_time_game_offset: number
  highest_score: number | null
  is_previous: boolean
  is_current: boolean
  is_next: boolean
  cup_leagues_created: boolean
  h2h_ko_matches_created: boolean
  chip_plays: ChipPlay[]
  most_selected: number | null
  most_transferred_in: number | null
  top_element: number | null
  top_element_info: TopElementInfo | null
  transfers_made: number
  most_captained: number | null
  most_vice_captained: number | null
}

export interface OverallStats {
  events: Event[]
  total_players: number
}

interface Result {
  id: number
  event_total: number
  player_name: string
  rank: number
  last_rank: number
  rank_sort: number
  total: number
  entry: number
  entry_name: string
}

type LeagueType = 's' | 'x'

interface League {
  id: number
  name: string
  short_name?: string
  created: string
  closed: boolean
  max_entries: number | null
  league_type: LeagueType
  scoring: 'c' // possible enum
  admin_entry: number | null
  start_event: number
  entry_can_leave?: boolean
  entry_can_admin?: boolean
  entry_can_invite?: boolean
  code_privacy: 'p' // possible enum
  has_cup: boolean
  cup_league: boolean | null // not sure about type
  cup_qualified?: boolean | null // not sure about type
  rank: number | null // not sure about type
  entry_rank?: number
  entry_last_rank?: number
}

export interface LeagueData {
  new_entries: {
    has_next: boolean
    page: number
    results: Result[]
  }
  last_updated_data: string
  league: League
  standings: {
    has_next: boolean
    page: number
    results: Result[]
  }
}

export interface EntryData {
  id: number
  joined_time: string
  started_event: number
  favourite_team: number
  player_first_name: string
  player_last_name: string
  player_region_id: number
  player_region_name: string
  player_region_iso_code_short: string
  player_region_iso_code_long: string
  summary_overall_points: number
  summary_overall_rank: number
  summary_event_points: number
  summary_event_rank: number
  current_event: number
  leagues: {
    classic: League[]
    h2h: []
    cup: {
      matches: []
      status: {
        qualification_event: null
        qualification_numbers: null
        qualification_rank: null
        qualification_state: null
      }
      cup_league: null
    }
    cup_matches: []
  }
  name: string
  name_change_blocked: boolean
  kit: string
  last_deadline_bank: number
  last_deadline_value: number
  last_deadline_total_transfers: number
}
