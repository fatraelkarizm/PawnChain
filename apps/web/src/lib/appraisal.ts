import crypto from "node:crypto";
import type { AppraisalResult, AssetCondition, AssetType, ComparableReference } from "@/types/pawn";
import { SOL_PRICE_IDR_ESTIMATE } from "./security";

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

function getCachedBenchmarks(brand: string, model: string, assetType: AssetType): ComparableReference[] {
  const now = new Date().toISOString();
  const label = `${brand} ${model}`.trim() || "Digital Collateral";
  const key = label.toLowerCase();

  if (assetType === "DIGITAL") {
    return [
      {
        title: `${label} Floor Listing #1`,
        source: "Magic Eden (Cached Floor)",
        url: "https://magiceden.io",
        priceIdr: Math.round(3.4 * SOL_PRICE_IDR_ESTIMATE),
        priceSol: 3.4,
        fetchedAt: now,
        sourceType: "cached_benchmark",
      },
      {
        title: `${label} Recent Sale #2`,
        source: "Tensor Trade (Cached Floor)",
        url: "https://www.tensor.trade",
        priceIdr: Math.round(3.6 * SOL_PRICE_IDR_ESTIMATE),
        priceSol: 3.6,
        fetchedAt: now,
        sourceType: "cached_benchmark",
      },
      {
        title: `${label} Verified Bid #3`,
        source: "Solana Floor Index",
        url: "https://magiceden.io",
        priceIdr: Math.round(3.2 * SOL_PRICE_IDR_ESTIMATE),
        priceSol: 3.2,
        fetchedAt: now,
        sourceType: "cached_benchmark",
      },
    ];
  }

  let baseIdr = 6_500_000;
  if (key.includes("iphone 15") || key.includes("macbook")) baseIdr = 12_800_000;
  else if (key.includes("iphone 14")) baseIdr = 9_500_000;
  else if (key.includes("iphone 13")) baseIdr = 8_000_000;
  else if (key.includes("emas") || key.includes("antam") || key.includes("gold")) baseIdr = 7_500_000;
  else if (key.includes("rolex") || key.includes("seiko")) baseIdr = 5_800_000;

  const spread = [0.94, 1.0, 1.05];
  const sources = [
    { name: "Tokopedia", url: "https://www.tokopedia.com" },
    { name: "OLX Indonesia", url: "https://www.olx.co.id" },
    { name: "Blibli Pre-Owned", url: "https://www.blibli.com" },
  ];

  return spread.map((mult, idx) => {
    const priceIdr = Math.round(baseIdr * mult);
    return {
      title: `${label} — Listing Pembanding #${idx + 1}`,
      source: `${sources[idx].name} (Cached Benchmark)`,
      url: sources[idx].url,
      priceIdr,
      priceSol: Number((priceIdr / SOL_PRICE_IDR_ESTIMATE).toFixed(3)),
      fetchedAt: now,
      sourceType: "cached_benchmark",
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
    const query = `${brand} ${model} ${condition === "Mint" ? "mulus" : "bekas"} harga Rp`;
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: 6,
        scrapeOptions: { formats: ["markdown"] },
      }),
      signal: AbortSignal.timeout(7000),
    });

    if (!res.ok) return null;
    const payload = (await res.json()) as {
      data?: Array<{ url?: string; title?: string; description?: string; markdown?: string }>;
    };

    const refs: ComparableReference[] = [];
    const now = new Date().toISOString();

    for (const item of payload.data || []) {
      const combined = `${item.title || ""} ${item.description || ""} ${item.markdown || ""}`;
      const prices = extractIdrPricesFromText(combined);
      if (prices.length === 0 || !item.url) continue;

      const medianItemPrice = computeMedian(filterOutliers(prices));
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
        priceIdr: medianItemPrice,
        priceSol: Number((medianItemPrice / SOL_PRICE_IDR_ESTIMATE).toFixed(3)),
        fetchedAt: now,
        sourceType: "firecrawl_live",
      });
      if (refs.length >= 3) break;
    }

    return refs.length > 0 ? refs : null;
  } catch {
    return null;
  }
}

export async function runAiAppraisal(input: AppraisalInput): Promise<AppraisalResult> {
  const liveRefs =
    input.assetType === "PHYSICAL"
      ? await fetchFirecrawlReferences(input.brand, input.model, input.condition)
      : null;

  const refs = liveRefs ?? getCachedBenchmarks(input.brand, input.model, input.assetType);
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
    riskFactors.push("Menggunakan referensi pasar ter-cache (Firecrawl live fallback)");
  }

  const confidenceScore = liveRefs ? 0.88 : input.hasSerial ? 0.79 : 0.66;
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
    modelVersion: liveRefs ? "pawnchain-firecrawl-v1" : "pawnchain-benchmark-v1",
    createdAt: new Date().toISOString(),
  };
}
