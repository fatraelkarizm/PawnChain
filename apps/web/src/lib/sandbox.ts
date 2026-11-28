/** Fixed demo identities. Sandbox tickets never touch the chain. */
export const SANDBOX_WALLETS = {
  borrower: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  lender: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  custodian: "CustodianHubJakartaVerified11111111111111111",
} as const;

export type SandboxRole = keyof typeof SANDBOX_WALLETS;
