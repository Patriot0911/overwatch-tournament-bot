import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  balancerInputSchema,
  balancerListSchema,
  balancerPlayerInputSchema,
  emptyToUndefined,
  formatZodIssues,
  stringifyPlayers,
  tryParseJson,
} from '../../src/modules/balancer/dto/balancer-input.schema';
import { balancerOptionsSchema } from '../../src/modules/balancer/dto/balancer-options.schema';
import { randomRawPool, createRng } from './helpers/random-pool';

const toPlainJson = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value));

const player = (extra: Record<string, unknown>) => ({
  discordId: '1',
  username: 'ana',
  ...extra,
});

describe('rating formats accepted in the JSON', () => {
  const accepted: [string, unknown, number][] = [
    ['rank name', 'Gold 3', 1200],
    ['lower case', 'gold 3', 1200],
    ['upper case', 'GOLD 3', 1200],
    ['mixed case', 'gOlD 3', 1200],
    ['surrounding spaces', '  Gold 3  ', 1200],
    ['no space', 'Gold3', 1200],
    ['extra inner spaces', 'Gold    3', 1200],
    ['hyphen instead of space', 'gold-3', 1200],
    ['underscore instead of space', 'gold_3', 1200],
    ['lowest rank', 'Bronze 5', 50],
    ['bronze 1', 'Bronze 1', 250],
    ['emerald 1', 'Emerald 1', 3750],
    ['diamond 1', 'Diamond 1', 5250],
    ['master 1', 'Master 1', 7000],
    ['grandmaster 1', 'Grandmaster 1', 9000],
    ['champion', 'Champion', 9450],
    ['champion lower case', 'champion', 9450],
    ['plain number', 1200, 1200],
    ['number 1', 1, 1],
    ['huge number', 1_000_000, 1_000_000],
    ['numeric string', '1200', 1200],
    ['numeric string with spaces', ' 1200 ', 1200],
    ['numeric string with leading zeros', '007', 7],
  ];

  for (const [label, input, expected] of accepted) {
    it(`${label}: ${JSON.stringify(input)} -> ${expected}`, () => {
      const parsed = balancerPlayerInputSchema.parse(player({ tank: input }));
      assert.equal(parsed.tank, expected);
    });
  }

  it('gives every role the same treatment', () => {
    const parsed = balancerPlayerInputSchema.parse(
      player({ tank: 'Gold 3', damage: 'Gold 3', support: 'Gold 3' }),
    );
    assert.deepEqual(
      [parsed.tank, parsed.damage, parsed.support],
      [1200, 1200, 1200],
    );
  });

  it('orders ranks from Bronze 5 up to Champion', () => {
    const tiers = [
      'Bronze',
      'Silver',
      'Gold',
      'Platinum',
      'Emerald',
      'Diamond',
      'Master',
      'Grandmaster',
    ];
    const values: number[] = [];
    for (const tier of tiers) {
      for (const division of [5, 4, 3, 2, 1]) {
        values.push(
          balancerPlayerInputSchema.parse(
            player({ tank: `${tier} ${division}` }),
          ).tank!,
        );
      }
    }
    values.push(
      balancerPlayerInputSchema.parse(player({ tank: 'Champion' })).tank!,
    );

    assert.equal(values.length, 41);
    for (let i = 1; i < values.length; i++) {
      assert.ok(
        values[i] > values[i - 1],
        `rank #${i} must be above rank #${i - 1}`,
      );
    }
  });
});

describe('ratings that are rejected', () => {
  const rejected: [string, unknown][] = [
    ['unknown tier', 'Wood 3'],
    ['division 0', 'Gold 0'],
    ['division 6', 'Gold 6'],
    ['two-digit division', 'Gold 12'],
    ['champion with a division', 'Champion 3'],
    ['tier with a space', 'Grand Master 1'],
    ['tier only', 'Gold'],
    ['empty string', ''],
    ['blank string', '   '],
    ['zero', 0],
    ['negative number', -1],
    ['negative numeric string', '-5'],
    ['zero as text', '0'],
    ['fraction', 1200.5],
    ['fraction as text', '1200.5'],
    ['exponent as text', '1e3'],
    ['NaN as text', 'NaN'],
    ['text with digits', 'abc123'],
    ['boolean', true],
    ['array', [1200]],
    ['object', { rank: 1200 }],
  ];

  for (const [label, input] of rejected) {
    it(`${label}: ${JSON.stringify(input)}`, () => {
      const result = balancerPlayerInputSchema.safeParse(
        player({ tank: input }),
      );
      assert.equal(result.success, false);
    });
  }

  it('reports which role and player index is wrong', () => {
    const result = balancerInputSchema.safeParse([
      player({ tank: 'Gold 3' }),
      { discordId: '2', username: 'bo', damage: 'Nope 1' },
    ]);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.match(formatZodIssues(result.error), /^1\.damage: Invalid rank/);
    }
  });
});

describe('player normalisation', () => {
  it('turns null and omitted roles into "does not play"', () => {
    const parsed = balancerPlayerInputSchema.parse(
      player({ tank: 'Gold 3', damage: null }),
    );
    assert.equal(parsed.tank, 1200);
    assert.equal(parsed.damage, undefined);
    assert.equal(parsed.support, undefined);
  });

  it('drops unknown fields instead of failing', () => {
    const parsed = balancerPlayerInputSchema.parse(
      player({ tank: 'Gold 3', region: 'EU', note: 'captain' }),
    );
    assert.deepEqual(Object.keys(parsed).sort(), [
      'discordId',
      'tank',
      'username',
    ]);
  });

  it('keeps ids and names exactly as given', () => {
    const parsed = balancerPlayerInputSchema.parse({
      discordId: '  000123  ',
      username: '  Ana  ',
      tank: 1,
    });
    assert.equal(parsed.discordId, '  000123  ');
    assert.equal(parsed.username, '  Ana  ');
  });

  it('accepts unicode and markdown-looking names', () => {
    for (const username of [
      'Анна',
      '日本語',
      '*bo_b*',
      '`code`',
      '😀',
      'a'.repeat(200),
    ]) {
      assert.equal(
        balancerPlayerInputSchema.parse({ discordId: '1', username, tank: 1 })
          .username,
        username,
      );
    }
  });

  it('requires at least one played role', () => {
    for (const roles of [
      {},
      { tank: null },
      { tank: null, damage: null, support: null },
    ]) {
      assert.equal(
        balancerPlayerInputSchema.safeParse(player(roles)).success,
        false,
      );
    }
  });
});

describe('list schemas', () => {
  const two = [
    player({ tank: 1 }),
    { discordId: '2', username: 'bo', damage: 1 },
  ];

  it('balancerInputSchema needs at least two players', () => {
    assert.equal(balancerInputSchema.safeParse([]).success, false);
    assert.equal(balancerInputSchema.safeParse(two.slice(0, 1)).success, false);
    assert.equal(balancerInputSchema.safeParse(two).success, true);
  });

  it('balancerListSchema accepts any size, including empty', () => {
    assert.equal(balancerListSchema.safeParse([]).success, true);
    assert.equal(balancerListSchema.safeParse(two.slice(0, 1)).success, true);
    assert.equal(balancerListSchema.safeParse(two).success, true);
  });

  it('both reject duplicate discord ids', () => {
    const duplicates = [...two, player({ damage: 5 })];
    assert.equal(balancerInputSchema.safeParse(duplicates).success, false);
    assert.equal(balancerListSchema.safeParse(duplicates).success, false);
  });

  it('treats ids that differ only in case or spaces as different', () => {
    const list = [
      { discordId: 'A', username: 'x', tank: 1 },
      { discordId: 'a', username: 'y', tank: 1 },
      { discordId: 'a ', username: 'z', tank: 1 },
    ];
    assert.equal(balancerListSchema.safeParse(list).success, true);
  });

  for (const [label, value] of [
    ['an object', {}],
    ['a string', 'x'],
    ['a number', 5],
    ['null', null],
    ['undefined', undefined],
  ] as const) {
    it(`rejects ${label} instead of an array`, () => {
      assert.equal(balancerInputSchema.safeParse(value).success, false);
      assert.equal(balancerListSchema.safeParse(value).success, false);
    });
  }

  it('accepts a large list', () => {
    const big = Array.from({ length: 500 }, (_, i) => ({
      discordId: String(i),
      username: `p${i}`,
      tank: i + 1,
    }));
    assert.equal(balancerInputSchema.safeParse(big).success, true);
  });
});

describe('options schema', () => {
  const accepted: [string, unknown][] = [
    ['no options', {}],
    ['team count', { teamCount: 3 }],
    ['smallest team count', { teamCount: 2 }],
    ['composition', { composition: { tank: 1, damage: 2, support: 2 } }],
    [
      'composition with zero slots',
      { composition: { tank: 0, damage: 5, support: 0 } },
    ],
    ['one role weight', { roleWeights: { tank: 1.6 } }],
    ['all role weights', { roleWeights: { tank: 2, damage: 1, support: 0.5 } }],
    ['tiny role weight', { roleWeights: { tank: 0.0001 } }],
    [
      'everything',
      {
        teamCount: 4,
        composition: { tank: 1, damage: 1, support: 1 },
        roleWeights: { support: 3 },
      },
    ],
  ];
  for (const [label, value] of accepted) {
    it(`accepts ${label}`, () => {
      assert.equal(balancerOptionsSchema.safeParse(value).success, true);
    });
  }

  const rejected: [string, unknown, RegExp][] = [
    ['team count 1', { teamCount: 1 }, /greater than or equal to 2/],
    ['team count 0', { teamCount: 0 }, /greater than or equal to 2/],
    ['negative team count', { teamCount: -3 }, /greater than or equal to 2/],
    ['fractional team count', { teamCount: 2.5 }, /integer/],
    ['team count as text', { teamCount: '2' }, /Expected number/],
    [
      'negative slots',
      { composition: { tank: -1, damage: 2, support: 2 } },
      /greater than or equal to 0/,
    ],
    [
      'fractional slots',
      { composition: { tank: 1, damage: 2.5, support: 2 } },
      /integer/,
    ],
    [
      'missing role in composition',
      { composition: { tank: 1, damage: 2 } },
      /Required/,
    ],
    [
      'unknown role in composition',
      { composition: { tank: 1, damage: 2, support: 2, flex: 1 } },
      /Unrecognized key/,
    ],
    ['zero weight', { roleWeights: { tank: 0 } }, /greater than 0/],
    ['negative weight', { roleWeights: { damage: -2 } }, /greater than 0/],
    ['weight as text', { roleWeights: { tank: '2' } }, /Expected number/],
    ['unknown role weight', { roleWeights: { healer: 2 } }, /Unrecognized key/],
    ['unknown option', { teamcount: 2 }, /Unrecognized key/],
    [
      'unknown option next to a valid one',
      { teamCount: 2, seed: 5 },
      /Unrecognized key/,
    ],
  ];
  for (const [label, value, message] of rejected) {
    it(`rejects ${label}`, () => {
      const result = balancerOptionsSchema.safeParse(value);
      assert.equal(result.success, false);
      if (!result.success) assert.match(formatZodIssues(result.error), message);
    });
  }
});

describe('JSON helpers', () => {
  it('tryParseJson parses valid JSON and reports invalid JSON as undefined', () => {
    assert.deepEqual(tryParseJson('[1,2]'), { value: [1, 2] });
    assert.deepEqual(tryParseJson('null'), { value: null });
    assert.equal(tryParseJson('[1,'), undefined);
    assert.equal(tryParseJson('{oops}'), undefined);
    assert.equal(tryParseJson(''), undefined);
    assert.equal(tryParseJson("{'single': 'quotes'}"), undefined);
    assert.equal(tryParseJson('[1,2,]'), undefined);
  });

  it('emptyToUndefined trims and blanks out', () => {
    assert.equal(emptyToUndefined(''), undefined);
    assert.equal(emptyToUndefined('   '), undefined);
    assert.equal(emptyToUndefined('\n\t'), undefined);
    assert.equal(emptyToUndefined('  Gold 3 '), 'Gold 3');
  });

  it('stringifyPlayers of an empty list is []', () => {
    assert.equal(stringifyPlayers([]), '[]');
  });

  it('stringifyPlayers writes one player per line', () => {
    const players = balancerListSchema.parse([
      { discordId: '1', username: 'ana', tank: 'Gold 3' },
      { discordId: '2', username: 'bo', damage: 700, support: 'Master 1' },
    ]);
    const lines = stringifyPlayers(players).split('\n');
    assert.equal(lines.length, players.length + 2);
    assert.equal(lines[0], '[');
    assert.equal(lines.at(-1), ']');
    lines.slice(1, -1).forEach((line, i) => {
      assert.match(line, /^ {2}\{/);
      const json = line.trim().replace(/,$/, '');
      assert.deepEqual(JSON.parse(json), players[i]);
    });
  });

  it('exports numbers, so a round trip through the schema is lossless', () => {
    const rng = createRng(2024);
    for (let round = 0; round < 60; round++) {
      const players = balancerListSchema.parse(
        randomRawPool(rng, 1 + Math.floor(rng() * 20)),
      );
      const exported = stringifyPlayers(players);
      const reimported = balancerListSchema.parse(
        tryParseJson(exported)!.value,
      );
      // A role that is undefined and one that is absent mean the same thing.
      assert.deepEqual(toPlainJson(reimported), toPlainJson(players));
    }
  });

  it('survives names that need JSON escaping', () => {
    const players = balancerListSchema.parse([
      { discordId: '1', username: 'say "hi"', tank: 5 },
      { discordId: '2', username: 'back\\slash', tank: 5 },
      { discordId: '3', username: 'tab\tand\nnewline', tank: 5 },
      { discordId: '4', username: '</script>', tank: 5 },
    ]);
    const exported = stringifyPlayers(players);
    assert.deepEqual(
      toPlainJson(balancerListSchema.parse(tryParseJson(exported)!.value)),
      toPlainJson(players),
    );
  });
});
