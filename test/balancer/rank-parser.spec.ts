import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OVERWATCH_RANK_TIERS,
  formatRankValue,
  parseRankValue,
} from '../../src/modules/balancer/rank-parser';

const CHAMPION = 9450;
const TIER_LABELS = OVERWATCH_RANK_TIERS.map(
  (tier) => tier.charAt(0).toUpperCase() + tier.slice(1),
);

describe('parseRankValue', () => {
  it('parses every tier and division and keeps them strictly ordered', () => {
    let previous = 0;
    for (const tier of TIER_LABELS) {
      for (const division of [5, 4, 3, 2, 1]) {
        const value = parseRankValue(`${tier} ${division}`);
        assert.ok(value !== null, `${tier} ${division} parses`);
        assert.ok(
          value > previous,
          `${tier} ${division} is above the previous rank`,
        );
        previous = value;
      }
    }
    assert.equal(parseRankValue('Champion'), CHAMPION);
    assert.ok(CHAMPION > previous, 'Champion is above Grandmaster 1');
  });

  it('has the documented anchor values', () => {
    const anchors: [string, number][] = [
      ['Bronze 5', 50],
      ['Bronze 4', 100],
      ['Bronze 1', 250],
      ['Silver 5', 350],
      ['Gold 3', 1200],
      ['Diamond 1', 5250],
      ['Master 1', 7000],
      ['Grandmaster 5', 7400],
      ['Grandmaster 1', 9000],
      ['Champion', 9450],
    ];
    for (const [name, value] of anchors) {
      assert.equal(parseRankValue(name), value, name);
    }
  });

  it('grows the step between divisions with the tier', () => {
    const step = (tier: string) =>
      parseRankValue(`${tier} 4`)! - parseRankValue(`${tier} 5`)!;
    const steps = TIER_LABELS.map(step);
    for (let i = 1; i < steps.length; i++) {
      assert.ok(steps[i] > steps[i - 1], `${TIER_LABELS[i]} step is larger`);
    }
  });

  it('passes positive integers through unchanged', () => {
    for (const value of [
      1,
      2,
      49,
      50,
      51,
      9450,
      9451,
      123456,
      Number.MAX_SAFE_INTEGER,
    ]) {
      assert.equal(parseRankValue(value), value);
      assert.equal(parseRankValue(String(value)), value);
    }
  });

  it('rejects non-positive and non-integer numbers', () => {
    for (const value of [
      0,
      -1,
      -100,
      0.5,
      1.0000001,
      NaN,
      Infinity,
      -Infinity,
    ]) {
      assert.equal(parseRankValue(value), null, String(value));
    }
  });

  it('rejects malformed text', () => {
    for (const text of [
      '',
      ' ',
      'Gold',
      'Gold 0',
      'Gold 6',
      'Gold 10',
      'Gold 3 3',
      'Gold-',
      '-3',
      'Champion 3',
      'Wood 3',
      'Grand Master 3',
      '3 Gold',
      'Gold Three',
      '1.5',
      '1e3',
      '0x10',
      '+5',
      'NaN',
      'Infinity',
    ]) {
      assert.equal(parseRankValue(text), null, JSON.stringify(text));
    }
  });

  it('is case, space and separator insensitive', () => {
    const expected = parseRankValue('Platinum 2');
    for (const text of [
      'platinum 2',
      'PLATINUM 2',
      'PlAtInUm 2',
      ' platinum   2 ',
      'platinum2',
      'platinum-2',
      'platinum_2',
      'platinum--2',
    ]) {
      assert.equal(parseRankValue(text), expected, JSON.stringify(text));
    }
  });
});

describe('formatRankValue', () => {
  it('is the inverse of parseRankValue for every exact rank value', () => {
    for (const tier of TIER_LABELS) {
      for (const division of [5, 4, 3, 2, 1]) {
        const name = `${tier} ${division}`;
        assert.equal(formatRankValue(parseRankValue(name)!), name);
      }
    }
    assert.equal(formatRankValue(CHAMPION), 'Champion');
  });

  it('rounds any value up to the rank that contains it', () => {
    for (let value = 1; value <= 9000; value += 7) {
      const label = formatRankValue(value);
      const roundTrip = parseRankValue(label);
      assert.ok(roundTrip !== null, `${value} -> ${label} parses`);
      assert.ok(
        roundTrip >= value,
        `${value} -> ${label} (${roundTrip}) is not below the value`,
      );
    }
  });

  it('never goes down as the value goes up', () => {
    let previous = 0;
    for (let value = 1; value <= CHAMPION + 100; value++) {
      const rank = parseRankValue(formatRankValue(value))!;
      assert.ok(rank >= previous, `value ${value}`);
      previous = rank;
    }
  });

  it('labels values above Grandmaster 1 as Champion', () => {
    for (const value of [9001, 9450, 9451, 20000, 1_000_000]) {
      assert.equal(formatRankValue(value), 'Champion');
    }
  });

  it('labels the smallest values Bronze 5', () => {
    for (const value of [1, 2, 25, 50]) {
      assert.equal(formatRankValue(value), 'Bronze 5');
    }
    assert.equal(formatRankValue(51), 'Bronze 4');
  });
});
