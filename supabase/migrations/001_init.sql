-- PawnChain MVP Schema (Supabase / PostgreSQL)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_wallet TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('DIGITAL', 'PHYSICAL')),
  category TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  description TEXT,
  serial_hash TEXT,
  metadata_hash TEXT,
  mint_address TEXT,
  condition TEXT DEFAULT 'Good',
  verification_status TEXT DEFAULT 'PENDING_REVIEW',
  custody_status TEXT DEFAULT 'UNVERIFIED',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_serial_hash ON assets(serial_hash);

CREATE TABLE IF NOT EXISTS appraisals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
  model_name TEXT,
  model_version TEXT,
  estimated_min BIGINT NOT NULL,
  estimated_max BIGINT NOT NULL,
  median_benchmark BIGINT NOT NULL,
  suggested_ltv NUMERIC NOT NULL,
  suggested_max_loan BIGINT NOT NULL,
  risk_score INTEGER NOT NULL,
  confidence_score NUMERIC NOT NULL,
  risk_factors_json JSONB,
  comparable_references_json JSONB,
  human_review_required BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS custody_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
  custodian_wallet TEXT NOT NULL,
  checkin_reference TEXT NOT NULL,
  condition_report TEXT,
  attestation_hash TEXT NOT NULL,
  status TEXT DEFAULT 'IN_CUSTODY',
  checked_in_at TIMESTAMPTZ DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pawn_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_ticket_id BIGINT UNIQUE NOT NULL,
  asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
  borrower_wallet TEXT NOT NULL,
  lender_wallet TEXT,
  principal_lamports BIGINT NOT NULL,
  interest_bps INTEGER NOT NULL,
  tenor_seconds BIGINT NOT NULL,
  due_at TIMESTAMPTZ,
  ltv NUMERIC NOT NULL,
  appraisal_id UUID REFERENCES appraisals(id),
  chain_ticket_pubkey TEXT,
  chain_tx_signature TEXT,
  status TEXT DEFAULT 'OPEN',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pawn_tickets_status ON pawn_tickets(status);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_wallet TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  after_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
