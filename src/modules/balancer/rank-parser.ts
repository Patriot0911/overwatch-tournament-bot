export const OVERWATCH_RANK_TIERS = [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'emerald',
  'diamond',
  'master',
  'grandmaster',
] as const;

export type OverwatchRankTier = (typeof OVERWATCH_RANK_TIERS)[number];

const DIVISIONS_PER_TIER = 5;
// Each tier's division step grows with the tier itself: Bronze=50, Silver=100, Gold=150, ...
const BASE_TIER_STEP = 50;

function tierStep(tierIndex: number): number {
  return (tierIndex + 1) * BASE_TIER_STEP;
}

// TIER_BASE_VALUES[i] is the value at the top of tier i - 1 (0 for the very first tier).
const TIER_BASE_VALUES: number[] = [];
let cumulativeTierValue = 0;
for (let tierIndex = 0; tierIndex < OVERWATCH_RANK_TIERS.length; tierIndex++) {
  TIER_BASE_VALUES.push(cumulativeTierValue);
  cumulativeTierValue += tierStep(tierIndex) * DIVISIONS_PER_TIER;
}

const CHAMPION_RANK_VALUE =
  cumulativeTierValue + tierStep(OVERWATCH_RANK_TIERS.length);

function tierDivisionValue(tierIndex: number, division: number): number {
  return (
    TIER_BASE_VALUES[tierIndex] +
    (DIVISIONS_PER_TIER - division + 1) * tierStep(tierIndex)
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Reverse of tierDivisionValue: maps a numeric rank value back to its "Tier Division" label.
export function formatRankValue(value: number): string {
  if (value > cumulativeTierValue) {
    return 'Champion';
  }

  for (
    let tierIndex = OVERWATCH_RANK_TIERS.length - 1;
    tierIndex >= 0;
    tierIndex--
  ) {
    if (value > TIER_BASE_VALUES[tierIndex]) {
      const offset = value - TIER_BASE_VALUES[tierIndex];
      const levelFromBottom = Math.min(
        DIVISIONS_PER_TIER,
        Math.ceil(offset / tierStep(tierIndex)),
      );
      const division = DIVISIONS_PER_TIER - levelFromBottom + 1;
      return `${capitalize(OVERWATCH_RANK_TIERS[tierIndex])} ${division}`;
    }
  }

  return `${capitalize(OVERWATCH_RANK_TIERS[0])} ${DIVISIONS_PER_TIER}`;
}

function parseRankName(text: string): number | null {
  const normalized = text
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized === 'champion') {
    return CHAMPION_RANK_VALUE;
  }

  const match = /^([a-z]+)\s*([1-5])$/.exec(normalized);
  if (!match) return null;

  const [, tierName, divisionText] = match;
  const tierIndex = OVERWATCH_RANK_TIERS.indexOf(tierName as OverwatchRankTier);
  if (tierIndex === -1) return null;

  return tierDivisionValue(tierIndex, Number(divisionText));
}

// Accepts a positive natural number or an Overwatch 2 rank name (e.g. "Gold 3", "Champion"); null otherwise.
export function parseRankValue(value: number | string): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number(trimmed);
    return parsed > 0 ? parsed : null;
  }

  return parseRankName(trimmed);
}
