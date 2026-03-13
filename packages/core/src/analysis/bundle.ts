import type { BundleAnalysis, BundleComponent, NormalizedListing } from "../domain.js";
import { normalizeText } from "../utils.js";

const lowTierPsuPatterns = [/unknown/, /\bbronze\b/, /\bnox\b/, /\ballied\b/, /\bin-win\b/];
const lowTierBoardPatterns = [/\bh610\b/, /\ba620\b/, /\bbarebones\b/];
const weakSsdPatterns = [/\bqlc\b/, /\bdramless\b/, /\bgen3\b/];
const weakCoolerPatterns = [/\bstock\b/, /\bboxed\b/, /\bair cooler\b/];
const weakCasePatterns = [/\bsolid front\b/, /\bglass-only intake\b/, /\bcompact\b/];

function matchComponent(component: BundleComponent, candidates: NormalizedListing[]) {
  const normalizedTarget = normalizeText(component.normalizedTitle || component.title);
  const targetTokens = normalizedTarget.split(/\s+/).filter((token) => token.length >= 2);

  return (
    candidates.find(
      (candidate) =>
        Boolean(component.ean) && component.ean === candidate.ean,
    ) ??
    candidates.find(
      (candidate) =>
        Boolean(component.mpn) && component.mpn === candidate.mpn,
    ) ??
    candidates.find(
      (candidate) =>
        normalizeText(candidate.normalizedModel).includes(normalizedTarget) ||
        normalizedTarget.includes(normalizeText(candidate.normalizedModel)),
    ) ??
    candidates
      .map((candidate) => {
        const candidateTokens = normalizeText(candidate.normalizedModel)
          .split(/\s+/)
          .filter((token) => token.length >= 2);
        const overlap = targetTokens.filter((token) => candidateTokens.includes(token)).length;
        return { candidate, overlap };
      })
      .sort((left, right) => right.overlap - left.overlap)
      .find((entry) => entry.overlap >= 2)?.candidate ??
    null
  );
}

function collectQualityFlags(components: BundleComponent[]): string[] {
  const flags: string[] = [];

  for (const component of components) {
    const normalized = normalizeText(component.title);
    const category = normalizeText(component.category);

    if (category.includes("psu") && lowTierPsuPatterns.some((pattern) => pattern.test(normalized))) {
      flags.push("Weak or unknown PSU quality");
    }

    if (
      category.includes("motherboard") &&
      lowTierBoardPatterns.some((pattern) => pattern.test(normalized))
    ) {
      flags.push("Entry-level motherboard likely limits upgrade path");
    }

    if (category.includes("ssd") && weakSsdPatterns.some((pattern) => pattern.test(normalized))) {
      flags.push("SSD tier appears weak for a premium prebuilt");
    }

    if (category.includes("cooler") && weakCoolerPatterns.some((pattern) => pattern.test(normalized))) {
      flags.push("Cooling solution may be under-specced");
    }

    if (category.includes("case") && weakCasePatterns.some((pattern) => pattern.test(normalized))) {
      flags.push("Case airflow description looks weak");
    }

    if (category.includes("ram") && /\b1 x\b/.test(normalized)) {
      flags.push("Single-stick memory configuration reduces performance");
    }
  }

  return [...new Set(flags)];
}

export function analyzeBundleAgainstParts(
  listing: NormalizedListing,
  candidates: NormalizedListing[],
): BundleAnalysis | null {
  if (!listing.components || listing.components.length === 0) {
    return null;
  }

  const matchedComponents = listing.components.map((component) => {
    const matched = matchComponent(component, candidates);
    return {
      ...component,
      ...(matched?.id ? { matchedListingId: matched.id } : {}),
      ...(matched?.url ? { matchedListingUrl: matched.url } : {}),
      matchedPrice: matched?.effectivePrice ?? matched?.price ?? null,
    };
  });

  const matchedPrices = matchedComponents
    .map((component) => component.matchedPrice)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const sumOfParts = matchedPrices.length > 0 ? matchedPrices.reduce((sum, value) => sum + value, 0) : null;
  const bundlePrice = listing.effectivePrice ?? listing.price ?? null;
  const bundleDeltaPct =
    sumOfParts && bundlePrice ? ((bundlePrice - sumOfParts) / sumOfParts) * 100 : null;
  const qualityFlags = collectQualityFlags(listing.components);
  const matchRatio = matchedComponents.length === 0 ? 0 : matchedPrices.length / matchedComponents.length;
  const confidence = Math.max(0.1, Math.min(1, matchRatio - qualityFlags.length * 0.08));

  let verdict: BundleAnalysis["verdict"] = "needs_review";
  if (bundleDeltaPct !== null) {
    if (bundleDeltaPct <= -8 && qualityFlags.length === 0) {
      verdict = "strong_buy";
    } else if (bundleDeltaPct <= 5 && qualityFlags.length <= 1) {
      verdict = "fair";
    } else {
      verdict = "avoid";
    }
  }

  return {
    sourceListingId: listing.id,
    sumOfParts,
    bundleDeltaPct,
    qualityFlags,
    confidence: Number(confidence.toFixed(2)),
    verdict,
    matchedComponents,
  };
}
