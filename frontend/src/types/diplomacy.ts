export type {
  AdminActionLogEntry,
  AdminBatchBoardEditRequest,
  AdminStatusResponse,
  BuildSummary,
  ConvoyReach,
  CreateGameRequest,
  FinalizeResponse,
  GameParticipant,
  GameState,
  GenerateAIOrdersRequest,
  IssueCode,
  IssueSeverity,
  JoinGameRequest,
  LobbyBrowsePage,
  LobbyGameRow,
  MultiplayerGameSummary,
  Order,
  OrderResolution,
  OrderType,
  PhaseTimer,
  Power,
  ProvinceInfo,
  ProvinceType,
  ScenarioRequest,
  SeedScenarioRequest,
  SimulationResult,
  SupportOption,
  TimerChoice,
  TimerStage,
  TurnHistoryEntry,
  TurnRecord,
  Unit,
  UnitMoveOptions,
  UnitType,
  ValidationIssue,
  WebSocketClientMessage,
  WebSocketGameUpdate,
  WebSocketLobbyUpdate,
  WebSocketMessage,
  WebSocketPong,
  WebSocketServerMessage,
} from '../api/schema.gen';

import type { Power } from '../api/schema.gen';

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

export interface AuthUser {
  id: string;
  user_id?: string;
  email: string;
  displayName: string;
  isLocalDemo?: boolean;
  needsUsernameSetup?: boolean;
}
