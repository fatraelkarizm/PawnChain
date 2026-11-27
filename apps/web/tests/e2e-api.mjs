import assert from "node:assert/strict";

const BASE = "http://localhost:3000";

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, data: json };
}

async function run() {
  // 1. Home HTML renders cleanly
  const home = await req("/");
  assert.equal(home.status, 200, "Home page should return 200");
  assert.ok(String(home.data).includes("PawnChain"), "Home HTML should contain PawnChain");

  // 2. Seeded tickets load
  const list1 = await req("/api/v1/tickets");
  assert.equal(list1.status, 200);
  assert.ok(list1.data.tickets.length >= 2, "Should return seeded tickets");

  // 3. AI Appraisal works & returns comparable references
  const appr = await req("/api/v1/appraisal", {
    method: "POST",
    body: JSON.stringify({
      assetType: "PHYSICAL",
      brand: "Apple",
      model: "iPhone 14 Pro 256GB",
      condition: "Mint",
      serialNumber: "359011223344999",
    }),
  });
  assert.equal(appr.status, 200);
  assert.ok(appr.data.appraisal.medianBenchmarkSol > 0);
  assert.ok(appr.data.appraisal.comparableReferences.length >= 2);

  // 4. Duplicate IMEI is blocked (409)
  const dup = await req("/api/v1/appraisal", {
    method: "POST",
    body: JSON.stringify({
      assetType: "PHYSICAL",
      brand: "Apple",
      model: "iPhone 13 Pro 256GB",
      condition: "Good",
      serialNumber: "356984110029384",
    }),
  });
  assert.equal(dup.status, 409, "Duplicate IMEI must be rejected with 409");
  assert.equal(dup.data.error, "POTENTIAL_DUPLICATE");

  // 5. Voice contract briefing returns script
  const voice = await req("/api/v1/voice/contract-briefing", {
    method: "POST",
    body: JSON.stringify({
      assetName: "Apple iPhone 14 Pro",
      principalSol: 1.5,
      interestPercent: 5,
      tenorDays: 14,
      language: "id",
    }),
  });
  assert.equal(voice.status, 200);
  assert.ok(voice.data.script.includes("1.5 SOL"));

  // 6. Create physical pawn ticket -> starts in PENDING_VERIFICATION
  const borrower = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
  const lender = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R";
  const custodian = "CustodianHubJakartaVerified11111111111111111";

  const created = await req("/api/v1/pawn-requests", {
    method: "POST",
    body: JSON.stringify({
      borrowerWallet: borrower,
      assetType: "PHYSICAL",
      brand: "Apple",
      model: "iPhone 14 Pro 256GB",
      condition: "Mint",
      serialNumber: `TESTIMEI${Date.now()}`,
      principalSol: 1.5,
      interestBps: 500,
      tenorDays: 14,
    }),
  });
  assert.equal(created.status, 201);
  const ticketId = created.data.ticket.id;
  assert.equal(created.data.ticket.status, "PENDING_VERIFICATION");

  // 7. Funding before custody attestation must be blocked (409)
  const earlyFund = await req(`/api/v1/pawn-tickets/${ticketId}`, {
    method: "POST",
    body: JSON.stringify({ action: "fund", actorWallet: lender }),
  });
  assert.equal(earlyFund.status, 409, "Cannot fund physical asset before custodian check");

  // 8. Borrower self-attestation must be blocked (403)
  const selfAttest = await req(`/api/v1/pawn-tickets/${ticketId}`, {
    method: "POST",
    body: JSON.stringify({ action: "custody_attest", actorWallet: borrower }),
  });
  assert.equal(selfAttest.status, 403, "Borrower cannot self-attest physical custody");

  const stranger = await req(`/api/v1/pawn-tickets/${ticketId}`, {
    method: "POST",
    body: JSON.stringify({ action: "custody_attest", actorWallet: lender }),
  });
  assert.equal(stranger.status, 403, "Only the registered custodian can attest");

  // Without price evidence a devnet appraisal must refuse instead of inventing prices
  const devnet = await req("/api/v1/appraisal", {
    method: "POST",
    body: JSON.stringify({
      mode: "devnet",
      assetType: "PHYSICAL",
      brand: "Nonexistent",
      model: "Zzqx 000",
      condition: "Good",
      serialNumber: `DEVNET${Date.now()}`,
    }),
  });
  if (devnet.status === 200) {
    assert.ok(
      devnet.data.appraisal.comparableReferences.every((r) => r.sourceType === "firecrawl_live")
    );
  } else {
    assert.equal(devnet.data.error, "INSUFFICIENT_DATA");
  }

  // 9. Custodian attestation moves ticket to OPEN
  const attested = await req(`/api/v1/pawn-tickets/${ticketId}`, {
    method: "POST",
    body: JSON.stringify({ action: "custody_attest", actorWallet: custodian }),
  });
  assert.equal(attested.status, 200);
  assert.equal(attested.data.ticket.status, "OPEN");

  // 10. Lender funds ticket -> ACTIVE
  const funded = await req(`/api/v1/pawn-tickets/${ticketId}`, {
    method: "POST",
    body: JSON.stringify({ action: "fund", actorWallet: lender }),
  });
  assert.equal(funded.status, 200);
  assert.equal(funded.data.ticket.status, "ACTIVE");

  // 11. Borrower repays atomically -> REPAID
  const repaid = await req(`/api/v1/pawn-tickets/${ticketId}`, {
    method: "POST",
    body: JSON.stringify({ action: "repay", actorWallet: borrower }),
  });
  assert.equal(repaid.status, 200);
  assert.equal(repaid.data.ticket.status, "REPAID");

  // 12. Shareable ticket detail page renders
  const sharePage = await req(`/ticket/${created.data.ticket.publicTicketId}`);
  assert.equal(sharePage.status, 200);
  assert.ok(String(sharePage.data).includes("iPhone 14 Pro 256GB"));

  console.log("ALL E2E API & STATE MACHINE ASSERTIONS PASSED!");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
