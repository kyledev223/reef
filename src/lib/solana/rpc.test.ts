import { afterEach, describe, expect, it } from "vitest";
import { RpcError, classifyRpcError, rpcLabel, rpcUrls, withRpc } from "./server";

const saved = { url: process.env.SOLANA_RPC_URL, net: process.env.SOLANA_NETWORK };
afterEach(() => {
  process.env.SOLANA_RPC_URL = saved.url;
  process.env.SOLANA_NETWORK = saved.net;
});

describe("Solana RPC fail-over", () => {
  it("uses configured endpoints in order, ending with the public one", () => {
    process.env.SOLANA_NETWORK = "mainnet-beta";
    process.env.SOLANA_RPC_URL = "https://a.example/?api-key=SECRET, https://b.example";
    expect(rpcUrls()).toEqual(["https://a.example/?api-key=SECRET", "https://b.example", "https://api.mainnet-beta.solana.com"]);
    expect(rpcLabel(rpcUrls()[0])).toBe("a.example"); // never the key
  });

  it("classifies transport errors", () => {
    expect(classifyRpcError(new Error("failed to get recent blockhash: Error: 429 Too Many Requests")).kind).toBe("rate-limited");
    expect(classifyRpcError(new Error("403 Forbidden")).kind).toBe("forbidden");
    expect(classifyRpcError(new Error("TypeError: fetch failed")).kind).toBe("unreachable");
    expect(classifyRpcError(new Error("Transaction simulation failed: insufficient funds")).kind).toBe("other");
  });

  it("falls over to the next endpoint when one is rate-limited", async () => {
    process.env.SOLANA_NETWORK = "mainnet-beta";
    process.env.SOLANA_RPC_URL = "https://busy.example";
    const seen: string[] = [];
    const result = await withRpc(async (c) => {
      seen.push(c.rpcEndpoint);
      if (c.rpcEndpoint.includes("busy")) throw new Error("429 Too Many Requests");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(seen.filter((u) => u.includes("busy")).length).toBe(2); // retried once, then moved on
    expect(seen.at(-1)).toContain("api.mainnet-beta.solana.com");
  });

  it("doesn't retry real errors (e.g. a rejected transaction)", async () => {
    process.env.SOLANA_RPC_URL = "https://a.example";
    let calls = 0;
    await expect(
      withRpc(async () => {
        calls++;
        throw new Error("Transaction simulation failed");
      }),
    ).rejects.toThrow("Transaction simulation failed");
    expect(calls).toBe(1);
  });

  it("reports why when every endpoint fails", async () => {
    process.env.SOLANA_NETWORK = "devnet";
    process.env.SOLANA_RPC_URL = "";
    const err = await withRpc(async () => {
      throw new Error("429 Too Many Requests");
    }).catch((e) => e);
    expect(err).toBeInstanceOf(RpcError);
    expect((err as RpcError).kind).toBe("rate-limited");
  });
});
