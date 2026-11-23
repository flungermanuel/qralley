/** Settings shared by playwright.config.ts and the e2e global setup. */
export const E2E_DATABASE_URL =
	process.env.E2E_DATABASE_URL ??
	"postgres://qurally:qurally_dev@localhost:5433/qurally_e2e";
export const E2E_API_PORT = 3100;
export const E2E_WEB_PORT = 4173;
/** Throwaway signing key for the e2e API only (32 bytes, base64url). */
export const E2E_QR_SIGNING_KEYS = JSON.stringify({
	"1": Buffer.alloc(32, 7).toString("base64url"),
});
