export type AssetType = "DIGITAL" | "PHYSICAL";
export type AssetCondition = "Mint" | "Good" | "Fair";
/** sandbox: simulated, no chain. devnet: state mirrors the on-chain PawnTicket account. */
export type TicketMode = "sandbox" | "devnet";
export type TicketStatus =
  | "PENDING_VERIFICATION"
  | "OPEN"
  | "ACTIVE"
  | "REPAID"
  | "DEFAULT_CLAIMED"
  | "CANCELLED";

export interface ComparableReference {
  title: string;
  source: string;
  url: string;
  priceIdr: number;
  priceSol: number;
  fetchedAt: string;
  sourceType: "firecrawl_live" | "sample_data";
}

export interface AppraisalResult {
  id: string;
  assetId: string;
  estimatedMinSol: number;
  estimatedMaxSol: number;
  medianBenchmarkSol: number;
  conditionAdjustedSol: number;
  suggestedLtv: number;
  suggestedMaxLoanSol: number;
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  confidenceScore: number;
  riskFactors: string[];
  missingInformation: string[];
  comparableReferences: ComparableReference[];
  humanReviewRequired: boolean;
  modelVersion: string;
  createdAt: string;
}

export interface AssetRecord {
  id: string;
  ownerWallet: string;
  assetType: AssetType;
  category: string;
  brand: string;
  model: string;
  description: string;
  serialHash: string | null;
  mintAddress: string | null;
  condition: AssetCondition;
  verificationStatus: "PENDING_REVIEW" | "VERIFIED" | "REJECTED";
  custodyStatus: "UNVERIFIED" | "IN_CUSTODY" | "LOCKED_ON_CHAIN" | "RELEASED";
  createdAt: string;
}

export interface PawnTicket {
  id: string;
  publicTicketId: number;
  mode: TicketMode;
  custodianWallet: string | null;
  asset: AssetRecord;
  appraisal: AppraisalResult;
  borrowerWallet: string;
  lenderWallet: string | null;
  principalLamports: number;
  interestBps: number;
  tenorDays: number;
  ltv: number;
  dueAt: string | null;
  chainTicketPubkey: string | null;
  chainTxSignature: string | null;
  repayTxSignature: string | null;
  custodyAttestationHash: string | null;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
}

/** Appraised metadata the server signs before the borrower creates the on-chain ticket. */
export interface PreparedPledge {
  assetType: AssetType;
  category: string;
  brand: string;
  model: string;
  condition: AssetCondition;
  description: string;
  /** Collateral fingerprint; also seeds the on-chain collateral lock. */
  serialHash: string;
  mintAddress: string | null;
  metadataUri: string;
  appraisal: AppraisalResult;
}
