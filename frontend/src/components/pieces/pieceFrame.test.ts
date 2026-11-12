import { describe, expect, it } from 'vitest';
import { measureMapName } from '../../data/mapTextMetrics';
import { PIECE_STYLES } from '../../utils/displayPrefs';
import { getPieceArrowScale, getPieceFrame, makePiecePill } from './pieceFrame';

describe('getPieceFrame', () => {
  it('keeps the classic values of the original map', () => {
    expect(getPieceFrame('classic')).toEqual({
      center: { x: 0, y: 0 },
      ringScale: 1,
      pill: null,
      hitRadius: 0,
      badgeLeft: { x: -17, y: -17 },
      badgeRight: { x: 16, y: -16 },
      bannerY: 26,
      dislodgeOffset: { x: 22, y: -18 },
      steppedAsideBannerY: 26,
    });
  });

  it('shrinks the rings and keeps a click target for seated and compact pieces', () => {
    expect(getPieceFrame('seated')).toMatchObject({
      ringScale: 0.8,
      hitRadius: 18,
      badgeLeft: { x: -14, y: -14 },
      bannerY: 23,
      steppedAsideBannerY: -23,
    });
    expect(getPieceFrame('compact')).toMatchObject({
      ringScale: 0.68,
      hitRadius: 17,
      badgeRight: { x: 11, y: -11 },
      bannerY: 20,
      steppedAsideBannerY: -20,
    });
  });

  it('steps a dislodged piece aside by a distance that suits the style', () => {
    expect(getPieceFrame('classic').dislodgeOffset).toEqual({ x: 22, y: -18 });
    expect(getPieceFrame('seated').dislodgeOffset).toEqual({ x: 19, y: -15 });
    expect(getPieceFrame('compact').dislodgeOffset).toEqual({ x: 16, y: -13 });
    expect(getPieceFrame('flags').dislodgeOffset).toEqual({ x: 20, y: 10 });
    expect(getPieceFrame('flags').steppedAsideBannerY).toBe(14);
  });

  it('lifts a flag off its pole and mirrors it with the direction', () => {
    expect(getPieceFrame('flags', 1)).toMatchObject({
      center: { x: 12, y: -14 },
      badgeLeft: { x: -3, y: -32 },
      badgeRight: { x: 27, y: -32 },
    });
    expect(getPieceFrame('flags', -1)).toMatchObject({
      center: { x: -12, y: -14 },
      badgeLeft: { x: -27, y: -32 },
      badgeRight: { x: 3, y: -32 },
    });
    expect(getPieceFrame('flags')).toEqual(getPieceFrame('flags', 1));
  });

  it('frames a nameplate by its pill, turned by the pill angle', () => {
    const pill = makePiecePill('Paris', 11, 0, false);
    const frame = getPieceFrame('nameplate', 1, pill);
    expect(frame.pill).toBe(pill);
    expect(frame.badgeLeft.x).toBeCloseTo(-pill.width / 2);
    expect(frame.badgeLeft.y).toBeCloseTo(-pill.height / 2);
    expect(frame.badgeRight.x).toBeCloseTo(pill.width / 2);
    expect(frame.bannerY).toBe(pill.height / 2 + 12);
    expect(frame.steppedAsideBannerY).toBe(-(pill.height / 2 + 12));
    expect(frame.dislodgeOffset).toEqual({ x: 0, y: -pill.height - 6 });

    const turned = getPieceFrame(
      'nameplate',
      1,
      makePiecePill('Paris', 11, 90, false),
    );
    expect(turned.badgeLeft.x).toBeCloseTo(pill.height / 2);
    expect(turned.badgeLeft.y).toBeCloseTo(-pill.width / 2);
  });

  it('falls back to the classic frame for a nameplate with no pill', () => {
    expect(getPieceFrame('nameplate')).toEqual(getPieceFrame('classic'));
  });
});

describe('makePiecePill', () => {
  it('sizes the plate by the name and leaves room for the mark and star', () => {
    const plain = makePiecePill('Paris', 11, 15, false);
    expect(plain).toMatchObject({
      name: 'Paris',
      fontSize: 11,
      angle: 15,
      hasStar: false,
      height: 19,
    });
    expect(plain.width).toBeCloseTo(measureMapName('Paris', 11) + 18 + 8);
    expect(plain.textX).toBe((18 - 8) / 2);

    const starred = makePiecePill('Paris', 11, 15, true);
    expect(starred.width).toBeCloseTo(measureMapName('Paris', 11) + 18 + 13);
    expect(starred.textX).toBe((18 - 13) / 2);
  });
});

describe('getPieceArrowScale', () => {
  it('stops arrows shorter of smaller pieces', () => {
    expect(PIECE_STYLES.map(getPieceArrowScale)).toEqual([
      1, 0.8, 0.7, 0.5, 0.8,
    ]);
  });
});
