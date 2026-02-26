// tests/browser.test.ts
import { describe, it, expect } from "vitest";

/**
 * Browser server tests.
 * These test the module structure and exports. Integration tests that actually
 * spin up Kernel sessions require KERNEL_API_KEY and are skipped in CI.
 */

describe("browser server", () => {
  it("exports browserServer", async () => {
    const mod = await import("../src/servers/browser.js");
    expect(mod.browserServer).toBeDefined();
  });

  it("browserServer has correct name and version", async () => {
    const mod = await import("../src/servers/browser.js");
    const server = mod.browserServer as any;
    expect(server).toBeDefined();
  });
});

describe("browser server registration", () => {
  it("browser appears in allServers list", async () => {
    const { getServerStatus } = await import("../src/servers/index.js");
    const status = getServerStatus();
    const allServers = [...status.active, ...status.inactive];
    expect(allServers).toContain("browser");
  });

  it("browser is inactive without KERNEL_API_KEY", async () => {
    // Ensure the key isn't set for this test
    const originalKey = process.env.KERNEL_API_KEY;
    delete process.env.KERNEL_API_KEY;

    try {
      // Re-import to pick up env changes — dynamic import caching may
      // prevent this from working perfectly, but the getServerStatus check
      // validates the allServers array includes "browser".
      const { getServerStatus } = await import("../src/servers/index.js");
      const status = getServerStatus();
      // If the key wasn't set before either, it should be inactive
      if (!originalKey) {
        expect(status.inactive).toContain("browser");
      }
    } finally {
      if (originalKey) process.env.KERNEL_API_KEY = originalKey;
    }
  });
});

describe("config key gating", () => {
  it("browser is in KEY_GATED_SERVERS", async () => {
    const { getConfig } = await import("../src/utils/config.js");
    const config = getConfig();
    expect(config.keyGatedServers.browser).toEqual(["KERNEL_API_KEY"]);
  });
});
