import { afterEach, describe, expect, it } from "vitest";
import { __resetGuardForTests, checkGuard, clientKey, guardResponse, recordOutcome } from "@/lib/proxy-guard";

afterEach(() => __resetGuardForTests());

describe("Anomaly guard", () => {
  it("severs the connection when one client floods the proxy", () => {
    let last = { allowed: true } as { allowed: boolean; retryAfter?: number };
    for (let i = 0; i < 121; i++) last = checkGuard("1.2.3.4");
    expect(last.allowed).toBe(false);
    expect(last.retryAfter).toBeGreaterThan(0);
    // While locked, every client — not just the flooder — is refused.
    expect(checkGuard("5.6.7.8").allowed).toBe(false);
  });

  it("severs the connection on a burst of failed upstream requests", () => {
    for (let i = 0; i < 41; i++) {
      checkGuard("9.9.9.9");
      recordOutcome("9.9.9.9", 502);
    }
    expect(checkGuard("9.9.9.9").allowed).toBe(false);
  });

  it("lets normal browsing through", () => {
    for (let i = 0; i < 50; i++) expect(checkGuard("8.8.8.8").allowed).toBe(true);
  });

  it("serves a 503 maintenance page with a retry hint while locked", async () => {
    for (let i = 0; i < 121; i++) checkGuard("1.2.3.4");
    const res = guardResponse(300);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("300");
    expect(await res.text()).toContain("一時的に停止しています");
  });

  it("identifies clients by their forwarding headers", () => {
    const req = new Request("https://azoc.lovable.app/public/proxy", {
      headers: { "cf-connecting-ip": "203.0.113.7" },
    });
    expect(clientKey(req)).toBe("203.0.113.7");
  });
});
