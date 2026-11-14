export type Power =
  | 'AUSTRIA'
  | 'ENGLAND'
  | 'FRANCE'
  | 'GERMANY'
  | 'ITALY'
  | 'RUSSIA'
  | 'TURKEY';

export type UnitType = 'A' | 'F';

export type ProvinceType = 'LAND' | 'COAST' | 'SEA' | 'IMPASSABLE';

export type OrderType =
  | 'HOLD'
  | 'MOVE'
  | 'SUPPORT'
  | 'CONVOY'
  | 'BUILD'
  | 'DISBAND'
  | 'WAIVE'
  | 'RETREAT';

export type IssueSeverity = 'error' | 'warning' | 'info';

export type IssueCode =
  | 'ILLEGAL_MOVE'
  | 'ILLEGAL_SUPPORT'
  | 'ILLEGAL_CONVOY'
  | 'SELF_BOUNCE'
  | 'SELF_OCCUPIED_BOUNCE'
  | 'FRIENDLY_FIRE'
  | 'UNMATCHED_SUPPORT'
  | 'BROKEN_CONVOY'
  | 'UNASSIGNED_UNIT'
  | 'VOID_SUPPORT_SELF';

export interface ProvinceInfo {
  id: string;
  name: string;
  type: ProvinceType;
  is_supply_center: boolean;
  home_power: Power | null;
  coasts: string[];
  army_adj: string[];
  fleet_adj: Record<string, string[]>;
}

export interface Unit {
  id: string;
  power: Power;
  unit_type: UnitType;
  province: string;
  coast?: string | null;
  is_dislodged?: boolean;
}

export interface Order {
  unit_id: string;
  power: Power;
  unit_type: UnitType;
  origin: string;
  origin_coast?: string | null;
  order_type: OrderType;
  target?: string | null;
  target_coast?: string | null;
  aux_unit_origin?: string | null;
  via_convoy: boolean;
  is_explicit: boolean;
}

export interface ValidationIssue {
  id: string;
  severity: IssueSeverity;
  code: IssueCode;
  title: string;
  message: string;
  unit_ids: string[];
  provinces: string[];
  power: Power;
}

export interface OrderResolution {
  unit_id: string;
  origin: string;
  order_type: OrderType;
  target?: string | null;
  succeeded: boolean;
  bounced: boolean;
  cut: boolean;
  dislodged: boolean;
  dislodged_by?: string | null;
  attack_strength: number;
  defense_strength: number;
  reason: string;
}

export interface SimulationResult {
  resolutions: Record<string, OrderResolution>;
  summary: string[];
  new_units: Unit[];
  new_ownership: Record<string, Power>;
  next_season?: string | null;
  next_year?: number | null;
  next_phase?: string | null;
  builds?: Record<Power, { count: number; homes: string[] }> | null;
  retreats?: Record<Power, Record<string, string[]>> | null;
  winner?: Power | null;
}

export type TimerStage = 'voting' | 'running' | 'paused';

export type TimerChoice = '15' | '20' | '30' | 'pause';

export interface PhaseTimer {
  stage: TimerStage;
  deadline: number | null; // Unix seconds; count down from remaining_seconds instead
  minutes: number | null;
  players: Power[];
  votes: Partial<Record<Power, TimerChoice>>;
  extend_requests: Power[];
  ready_powers: Power[];
  remaining_seconds: number | null;
  extensions_needed: number;
}

export interface ConvoyReach {
  direct: string[];
  chained: string[];
}

export interface SupportOption {
  unit_id: string;
  province: string;
  hold: boolean;
  moves: string[];
}

export interface UnitMoveOptions {
  direct_moves: string[];
  active_convoys: string[];
  potential_convoys: string[];
  /** The `potential_convoys` the unit's own power can reach with its own fleets alone. */
  own_fleet_convoys?: string[];
  convoyable_armies?: ConvoyReach | null;
  convoy_targets: Record<string, ConvoyReach>;
  valid_supports: SupportOption[];
}

export interface AdminActionLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  season: string;
  year: number;
  phase: string;
  summary_lines: string[];
  acknowledged_by: string[];
}

export interface GameState {
  game_id: string;
  season: string;
  year: number;
  phase: string;
  scenario_id: string;
  active_power: Power;
  units: Unit[];
  orders: Record<string, Order>;
  ownership: Record<string, Power>;
  finalized_powers: Power[];
  surrendered_powers?: Power[];
  issues: ValidationIssue[];
  last_resolution?: SimulationResult | null;
  turn_history: string[];
  builds?: Record<Power, { count: number; homes: string[] }> | null;
  retreats?: Record<Power, Record<string, string[]>> | null;
  winner?: Power | null;
  timer?: PhaseTimer | null;
  admin_log?: AdminActionLogEntry[];
  state_revision?: number;
  unit_options?: Record<string, UnitMoveOptions>;
}

/** One resolved phase in a game's history, as the turn selector lists it (oldest first). */
export interface TurnHistoryEntry {
  index: number;
  season: string;
  year: number;
  phase: string;
}

/**
 * A resolved phase as it began, with every power's orders and how each resolved. Orders are
 * public once their phase has resolved, so this holds all seven powers' orders.
 */
export interface TurnRecord extends TurnHistoryEntry {
  units: Unit[];
  orders: Record<string, Order>;
  ownership: Record<string, Power>;
  builds?: Record<Power, { count: number; homes: string[] }> | null;
  retreats?: Record<Power, Record<string, string[]>> | null;
  resolution: SimulationResult;
}

export interface FinalizeResponse {
  finalized: boolean;
  requires_confirmation: boolean;
  issues: ValidationIssue[];
  state: GameState;
}

export interface PowerMeta {
  id: Power;
  name: string;
  shortName: string;
  adjective: string;
  color: string;
  fillColor: string;
  borderColor: string;
  lightBg: string;
}

export const POWER_METADATA: Record<Power, PowerMeta> = {
  ENGLAND: {
    id: 'ENGLAND',
    name: 'United Kingdom',
    shortName: 'England',
    adjective: 'British',
    color: '#183668',
    fillColor: '#1e3e73',
    borderColor: '#0e2244',
    lightBg: 'rgba(24, 54, 104, 0.18)',
  },
  FRANCE: {
    id: 'FRANCE',
    name: 'French Republic',
    shortName: 'France',
    adjective: 'French',
    color: '#34789e',
    fillColor: '#6aa9c9',
    borderColor: '#215473',
    lightBg: 'rgba(52, 120, 158, 0.16)',
  },
  GERMANY: {
    id: 'GERMANY',
    name: 'German Empire',
    shortName: 'Germany',
    adjective: 'German',
    color: '#3d434d',
    fillColor: '#6f7785',
    borderColor: '#262a30',
    lightBg: 'rgba(61, 67, 77, 0.18)',
  },
  ITALY: {
    id: 'ITALY',
    name: 'Kingdom of Italy',
    shortName: 'Italy',
    adjective: 'Italian',
    color: '#2f6e49',
    fillColor: '#5da177',
    borderColor: '#1e4d31',
    lightBg: 'rgba(47, 110, 73, 0.16)',
  },
  AUSTRIA: {
    id: 'AUSTRIA',
    name: 'Austria-Hungary',
    shortName: 'Austria',
    adjective: 'Austro-Hungarian',
    color: '#9c3333',
    fillColor: '#c96565',
    borderColor: '#6e1f1f',
    lightBg: 'rgba(156, 51, 51, 0.16)',
  },
  RUSSIA: {
    id: 'RUSSIA',
    name: 'Russian Empire',
    shortName: 'Russia',
    adjective: 'Russian',
    color: '#67387e',
    fillColor: '#754e85',
    borderColor: '#431d56',
    lightBg: 'rgba(103, 56, 126, 0.16)',
  },
  TURKEY: {
    id: 'TURKEY',
    name: 'Ottoman Empire',
    shortName: 'Turkey',
    adjective: 'Ottoman',
    color: '#b88328',
    fillColor: '#d9aa55',
    borderColor: '#825a14',
    lightBg: 'rgba(184, 131, 40, 0.16)',
  },
};

export const ALL_POWERS: Power[] = [
  'FRANCE',
  'ENGLAND',
  'GERMANY',
  'ITALY',
  'AUSTRIA',
  'RUSSIA',
  'TURKEY',
];

export interface GameParticipant {
  user_id: string;
  email: string;
  display_name: string;
  power: Power;
  joined_at: string;
  surrendered?: boolean;
  surrendered_at?: string | null;
  game_over_seen_at?: string | null;
}

export interface MultiplayerGameSummary {
  game_id: string;
  name: string;
  status: 'waiting' | 'active' | 'completed' | string;
  winner?: Power | null;
  completed_at?: string | null;
  season: string;
  year: number;
  phase: string;
  created_by: string;
  creator_id?: string | null;
  created_at: string;
  /** When a phase last resolved; null until the first one does. */
  last_moved_at?: string | null;
  participants: Record<string, GameParticipant>;
  finalized_powers: Power[];
  surrendered_powers?: Power[];
  is_sandbox: boolean;
  is_draft?: boolean;
  is_private?: boolean;
  has_passcode?: boolean;
}

export interface CreateGameRequest {
  name: string;
  creator_power: Power;
  user_id?: string;
  email?: string;
  display_name?: string | null;
  is_private?: boolean;
  passcode?: string | null;
}

export interface JoinGameRequest {
  power: Power;
  user_id?: string;
  email?: string;
  display_name?: string | null;
  passcode?: string | null;
}

export interface GenerateAIOrdersRequest {
  powers?: Power[] | null;
  include_active?: boolean;
}

export interface AuthUser {
  id: string;
  user_id?: string;
  email: string;
  displayName: string;
  isLocalDemo?: boolean;
  needsUsernameSetup?: boolean;
}
export interface AdminStatusResponse {
  is_creator: boolean;
  can_rollback: boolean;
  history_count: number;
  history_entries?: TurnHistoryEntry[];
  creator_email: string;
  creator_id?: string | null;
}

export interface AdminBatchBoardEditRequest {
  expected_revision: number;
  expected_season: string;
  expected_year: number;
  expected_phase: string;
  units: Unit[];
  ownership: Record<string, Power>;
  orders?: Record<string, Order> | null;
  summary_lines?: string[] | null;
  user_id?: string | null;
  email?: string | null;
}

export interface WebSocketGameUpdate {
  type: 'game_update';
  game_id: string;
  state: GameState;
  summary: MultiplayerGameSummary | null;
}

/** Public matches only: the lobby socket never lists a private campaign or a sandbox. */
export interface WebSocketLobbyUpdate {
  type: 'lobby_update';
  games: MultiplayerGameSummary[];
}

/** One public game in `GET /api/games/browse`. Players appear by display name only. */
export interface LobbyGameRow {
  game_id: string;
  name: string;
  status: 'waiting' | 'active' | 'completed' | string;
  season: string;
  year: number;
  phase: string;
  host_name: string;
  created_at: string;
  /** created_at until a phase has resolved. */
  last_moved_at: string;
  claimed_powers: Power[];
  open_powers: Power[];
}

export interface LobbyBrowsePage {
  games: LobbyGameRow[];
  total: number;
  page: number;
  page_size: number;
}

export type WebSocketMessage =
  | WebSocketGameUpdate
  | WebSocketLobbyUpdate
  | { type: 'pong' };

export interface ScenarioRequest {
  scenario_id: string;
  active_power?: Power | null;
}

export interface SeedScenarioRequest {
  scenario_id: string;
  game_id?: string | null;
  active_power?: Power | null;
}
