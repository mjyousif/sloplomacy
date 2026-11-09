import { AlertTriangle, Globe, KeyRound, Lock, PlusCircle } from 'lucide-react';
import type React from 'react';
import {
  ALL_POWERS,
  type AuthUser,
  POWER_METADATA,
  type Power,
} from '../../types/diplomacy';

export interface CreateCampaignPanelProps {
  user: AuthUser | null;
  newGameName: string;
  setNewGameName: (val: string) => void;
  isPrivate: boolean;
  setIsPrivate: (val: boolean) => void;
  passcode: string;
  setPasscode: (val: string) => void;
  selectedCreatePower: Power;
  setSelectedCreatePower: (val: Power) => void;
  createError: string | null;
  creating: boolean;
  handleCreateMatch: (e: React.FormEvent) => void;
  joinCodeGameId: string;
  setJoinCodeGameId: (val: string) => void;
  joinCodePasscode: string;
  setJoinCodePasscode: (val: string) => void;
  joinCodePower: Power;
  setJoinCodePower: (val: Power) => void;
  joinCodeLoading: boolean;
  joinCodeError: string | null;
  handleJoinCodeSubmit: (e: React.FormEvent) => void;
}

export const CreateCampaignPanel: React.FC<CreateCampaignPanelProps> = ({
  user,
  newGameName,
  setNewGameName,
  isPrivate,
  setIsPrivate,
  passcode,
  setPasscode,
  selectedCreatePower,
  setSelectedCreatePower,
  createError,
  creating,
  handleCreateMatch,
  joinCodeGameId,
  setJoinCodeGameId,
  joinCodePasscode,
  setJoinCodePasscode,
  joinCodePower,
  setJoinCodePower,
  joinCodeLoading,
  joinCodeError,
  handleJoinCodeSubmit,
}) => {
  return (
    <>
      {/* 1. Host New Campaign Card */}
      <div className="lobby-create-card">
        <div className="lobby-create-header">
          <PlusCircle size={18} />
          <h3>Host New Multiplayer Game</h3>
        </div>
        <p className="lobby-create-desc">
          Create a new 1901 European theater as either a public match or a
          private campaign with a secret passcode.
        </p>

        <form onSubmit={handleCreateMatch} className="lobby-create-form">
          <div className="lobby-field">
            <label htmlFor="new-game-name">Campaign Name</label>
            <input
              id="new-game-name"
              type="text"
              placeholder="e.g. Congress of Vienna #42"
              value={newGameName}
              onChange={(e) => setNewGameName(e.target.value)}
            />
          </div>

          {/* Public vs Private Campaign Toggle */}
          <div className="lobby-field">
            <label>Campaign Access</label>
            <div className="privacy-toggle-row">
              <button
                type="button"
                className={`privacy-toggle-btn ${!isPrivate ? 'active' : ''}`}
                onClick={() => {
                  setIsPrivate(false);
                  setPasscode('');
                }}
              >
                <Globe size={13} />
                <span>Public Lobby</span>
              </button>
              <button
                type="button"
                className={`privacy-toggle-btn ${isPrivate ? 'active' : ''}`}
                onClick={() => setIsPrivate(true)}
              >
                <Lock size={13} />
                <span>Private (Passcode)</span>
              </button>
            </div>
          </div>

          {isPrivate && (
            <div className="lobby-field">
              <label htmlFor="private-passcode">Campaign Passcode / PIN</label>
              <input
                id="private-passcode"
                type="text"
                placeholder="Enter secret passcode (e.g. Vienna1901)"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                required={isPrivate}
              />
              <span className="field-hint">
                Players will need to enter this passcode to join your private
                campaign.
              </span>
            </div>
          )}

          <div className="lobby-field">
            <label>Pick Your Sovereign Country</label>
            <div className="create-power-picker">
              {ALL_POWERS.map((pwr) => {
                const meta = POWER_METADATA[pwr];
                const selected = selectedCreatePower === pwr;
                return (
                  <button
                    key={pwr}
                    type="button"
                    onClick={() => setSelectedCreatePower(pwr)}
                    className={`create-power-option ${
                      selected ? 'selected' : ''
                    }`}
                    style={{
                      borderColor: selected ? meta.color : undefined,
                      backgroundColor: selected ? meta.lightBg : undefined,
                    }}
                  >
                    <span>{meta.crest}</span>
                    <span>{meta.shortName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {createError && (
            <div className="lobby-error-alert">
              <AlertTriangle size={14} />
              <span>{createError}</span>
            </div>
          )}

          <button
            type="submit"
            className="lobby-create-submit-btn"
            disabled={creating}
          >
            <PlusCircle size={16} />
            <span>
              {creating
                ? 'Creating Campaign...'
                : user
                  ? `Create ${isPrivate ? 'Private' : ''} & Play as ${POWER_METADATA[selectedCreatePower].shortName}`
                  : 'Sign In to Host Campaign'}
            </span>
          </button>
        </form>
      </div>

      {/* 2. Join Private Campaign by Game ID & Passcode */}
      <div
        className="lobby-create-card join-card"
        style={{ marginTop: '20px' }}
      >
        <div className="lobby-create-header">
          <KeyRound size={18} />
          <h3>Join Private Campaign</h3>
        </div>
        <p className="lobby-create-desc">
          Have a Game ID and passcode from a host? Enter them below to claim
          your nation and join the war room.
        </p>

        <form onSubmit={handleJoinCodeSubmit} className="lobby-create-form">
          <div className="lobby-field">
            <label htmlFor="join-code-id">Game ID</label>
            <input
              id="join-code-id"
              type="text"
              placeholder="e.g. mp_3d8f2b"
              value={joinCodeGameId}
              onChange={(e) => setJoinCodeGameId(e.target.value)}
              required
            />
          </div>

          <div className="lobby-field">
            <label htmlFor="join-code-passcode">Lobby Passcode</label>
            <input
              id="join-code-passcode"
              type="text"
              placeholder="Enter lobby passcode"
              value={joinCodePasscode}
              onChange={(e) => setJoinCodePasscode(e.target.value)}
            />
          </div>

          <div className="lobby-field">
            <label>Nation to Claim</label>
            <div className="create-power-picker">
              {ALL_POWERS.map((pwr) => {
                const meta = POWER_METADATA[pwr];
                const selected = joinCodePower === pwr;
                return (
                  <button
                    key={pwr}
                    type="button"
                    onClick={() => setJoinCodePower(pwr)}
                    className={`create-power-option ${
                      selected ? 'selected' : ''
                    }`}
                    style={{
                      borderColor: selected ? meta.color : undefined,
                      backgroundColor: selected ? meta.lightBg : undefined,
                    }}
                  >
                    <span>{meta.crest}</span>
                    <span>{meta.shortName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {joinCodeError && (
            <div className="lobby-error-alert">
              <AlertTriangle size={14} />
              <span>{joinCodeError}</span>
            </div>
          )}

          <button
            type="submit"
            className="lobby-join-submit-btn"
            disabled={joinCodeLoading || !joinCodeGameId.trim()}
          >
            <KeyRound size={15} />
            <span>
              {joinCodeLoading
                ? 'Verifying & Joining...'
                : user
                  ? `Unlock & Claim ${POWER_METADATA[joinCodePower].shortName}`
                  : 'Sign In to Join Campaign'}
            </span>
          </button>
        </form>
      </div>
    </>
  );
};
