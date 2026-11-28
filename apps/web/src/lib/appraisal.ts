import crypto from "node:crypto";
import type { AppraisalResult, AssetCondition, AssetType, ComparableReference } from "@/types/pawn";
import { SOL_PRICE_IDR_ESTIMATE, SOL_PRICE_USD_ESTIMATE } from "./security";

interface AppraisalInput {
  assetId: string;
  assetType: AssetType;
  category: string;
  brand: string;
  model: string;
  condition: AssetCondition;
  hasSerial: boolean;
}

const CONDITION_FACTOR: Record<AssetCondition, number> = {
  Mint: 1.0,
  Good: 0.9,
  Fair: 0.7,
};

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function filterOutliers(pricesIdr: number[]): number[] {
  if (pricesIdr.length <= 2) return pricesIdr;
  const med = computeMedian(pricesIdr);
  // Drop accessories or extreme anomalies (< 40% or > 200% of rough median)
  const filtered = pricesIdr.filter((p) => p >= med * 0.4 && p <= med * 2.0);
  return filtered.length > 0 ? filtered : pricesIdr;
}

const USD_TO_IDR = Math.round(SOL_PRICE_IDR_ESTIMATE / SOL_PRICE_USD_ESTIMATE);

function extractUsdPricesFromText(text: string): number[] {
  const matches = text.match(/(?:\$|USD\s?)(\d{2,5}(?:,\d{3})*(?:\.\d{1,2})?)/gi) || [];
  const parsed: number[] = [];
  for (const m of matches) {
    const cleaned = m.replace(/[^0-9.]/g, "");
    const val = Number(cleaned);
    if (Number.isFinite(val) && val >= 40 && val <= 50_000) {
      parsed.push(val);
    }
  }
  return parsed;
}

function extractIdrPricesFromText(text: string): number[] {
  const matches = text.match(/Rp\s?(\d{1,3}(?:[.,]\d{3})+)/gi) || [];
  const parsed: number[] = [];
  for (const m of matches) {
    const digits = m.replace(/[^0-9]/g, "");
    const val = Number(digits);
    if (val >= 200_000 && val <= 500_000_000) {
      parsed.push(val);
    }
  }
  return parsed;
}

export const SAMPLE_SOURCE = "Sample data (not a market price)";

// Sandbox only. No marketplace names or links, so it cannot pass for real evidence.
function getSampleReferences(brand: string, model: string, assetType: AssetType): ComparableReference[] {
  const now = new Date().toISOString();
  const key = `${brand} ${model}`.toLowerCase();

  let baseIdr = 6_500_000;
  if (assetType === "DIGITAL") baseIdr = 3.4 * SOL_PRICE_IDR_ESTIMATE;
  else if (key.includes("iphone 15") || key.includes("macbook")) baseIdr = 12_800_000;
  else if (key.includes("iphone 14")) baseIdr = 9_500_000;
  else if (key.includes("iphone 13")) baseIdr = 8_000_000;

  return [0.94, 1.0, 1.05].map((mult, idx) => {
    const priceIdr = Math.round(baseIdr * mult);
    return {
      title: `Sample listing ${idx + 1}`,
      source: SAMPLE_SOURCE,
      url: "",
      priceIdr,
      priceSol: Number((priceIdr / SOL_PRICE_IDR_ESTIMATE).toFixed(3)),
      fetchedAt: now,
      sourceType: "sample_data",
    };
  });
}

async function fetchFirecrawlReferences(
  brand: string,
  model: string,
  condition: AssetCondition
): Promise<ComparableReference[] | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;

  try {
    const query = `${brand} ${model} ${condition === "Mint" ? "mint" : "used"} price USD`;
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: 8,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const payload = (await res.json()) as {
      data?: Array<{ url?: string; title?: string; description?: string; markdown?: string }>;
    };

    const refs: ComparableReference[] = [];
    const now = new Date().toISOString();

    for (const item of payload.data || []) {
      const combined = `${item.title || ""} ${item.description || ""} ${item.markdown || ""}`;
      const usdPrices = extractUsdPricesFromText(combined);
      const idrPrices = usdPrices.length === 0 ? extractIdrPricesFromText(combined) : [];
      if ((usdPrices.length === 0 && idrPrices.length === 0) || !item.url) continue;

      const medianUsd =
        usdPrices.length > 0
          ? computeMedian(filterOutliers(usdPrices))
          : computeMedian(filterOutliers(idrPrices)) / USD_TO_IDR;
      const medianItemPriceIdr = Math.round(medianUsd * USD_TO_IDR);
      let host = "Web Listing";
      try {
        host = new URL(item.url).hostname.replace("www.", "");
      } catch {
        host = "Marketplace";
      }

      refs.push({
        title: (item.title || `${brand} ${model}`).slice(0, 72),
        source: host,
        url: item.url,
        priceIdr: medianItemPriceIdr,
        priceSol: Number((medianUsd / SOL_PRICE_USD_ESTIMATE).toFixed(3)),
        fetchedAt: now,
        sourceType: "firecrawl_live",
      });
      if (refs.length >= 3) break;
    }

    // A single listing is not enough evidence for a median.
    return refs.length >= 2 ? refs : null;
  } catch {
    return null;
  }
}

function unappraised(assetId: string): AppraisalResult {
  return {
    id: crypto.randomUUID(),
    assetId,
    estimatedMinSol: 0,
    estimatedMaxSol: 0,
    medianBenchmarkSol: 0,
    conditionAdjustedSol: 0,
    suggestedLtv: 0,
    suggestedMaxLoanSol: 0,
    riskScore: 100,
    riskLevel: "HIGH",
    confidenceScore: 0,
    riskFactors: ["No market price source for this digital asset; lenders must value it themselves"],
    missingInformation: ["Market price evidence"],
    comparableReferences: [],
    humanReviewRequired: true,
    modelVersion: "unappraised",
    createdAt: new Date().toISOString(),
  };
}

/** Returns null when a physical asset lacks price evidence and sample data is not allowed. */
export async function runAiAppraisal(
  input: AppraisalInput,
  { allowSample }: { allowSample: boolean }
): Promise<AppraisalResult | null> {
  const liveRefs =
    input.assetType === "PHYSICAL"
      ? await fetchFirecrawlReferences(input.brand, input.model, input.condition)
      : null;

  if (!liveRefs && !allowSample) {
    return input.assetType === "DIGITAL" ? unappraised(input.assetId) : null;
  }

  const refs = liveRefs ?? getSampleReferences(input.brand, input.model, input.assetType);
  const validPricesIdr = filterOutliers(refs.map((r) => r.priceIdr));
  const medianIdr = computeMedian(validPricesIdr);
  const minIdr = Math.min(...validPricesIdr);
  const maxIdr = Math.max(...validPricesIdr);

  const medianBenchmarkSol = Number((medianIdr / SOL_PRICE_IDR_ESTIMATE).toFixed(3));
  const estimatedMinSol = Number((minIdr / SOL_PRICE_IDR_ESTIMATE).toFixed(3));
  const estimatedMaxSol = Number((maxIdr / SOL_PRICE_IDR_ESTIMATE).toFixed(3));

  const factor = CONDITION_FACTOR[input.condition];
  const conditionAdjustedSol = Number((medianBenchmarkSol * factor).toFixed(3));
  const suggestedLtv = input.assetType === "DIGITAL" ? 0.6 : input.hasSerial ? 0.6 : 0.5;
  const suggestedMaxLoanSol = Number((conditionAdjustedSol * suggestedLtv).toFixed(3));

  const riskFactors: string[] = [];
  const missingInformation: string[] = [];
  let riskScore = 22;

  if (input.assetType === "PHYSICAL") {
    riskFactors.push("Memerlukan verifikasi fisik oleh Custodian sebelum pendanaan");
    if (!input.hasSerial) {
      riskScore += 25;
      riskFactors.push("Serial/IMEI belum diisi (LTV diturunkan ke 50%)");
      missingInformation.push("Nomor Serial / IMEI");
    }
  } else {
    riskFactors.push("Aset digital dikunci langsung di PDA Escrow Solana");
  }

  if (input.condition === "Fair") {
    riskScore += 18;
    riskFactors.push("Kondisi fisik Fair menurunkan nilai likuidasi cepat");
  }

  if (!liveRefs) {
    riskFactors.push("Sandbox: harga contoh, bukan data pasar");
  }

  const confidenceScore = !liveRefs ? 0 : refs.length >= 3 ? 0.85 : 0.7;
  const riskLevel: "LOW" | "MEDIUM" | "HIGH" =
    riskScore <= 30 ? "LOW" : riskScore <= 55 ? "MEDIUM" : "HIGH";

  return {
    id: crypto.randomUUID(),
    assetId: input.assetId,
    estimatedMinSol,
    estimatedMaxSol,
    medianBenchmarkSol,
    conditionAdjustedSol,
    suggestedLtv,
    suggestedMaxLoanSol,
    riskScore,
    riskLevel,
    confidenceScore,
    riskFactors,
    missingInformation,
    comparableReferences: refs,
    humanReviewRequired: confidenceScore < 0.72 || riskLevel === "HIGH",
    modelVersion: liveRefs ? "pawnchain-firecrawl-v1" : "sample-data",
    createdAt: new Date().toISOString(),
  };
}
