import { FetchRequest, JsonRpcProvider, keccak256, type JsonRpcApiProviderOptions, type JsonRpcPayload, type JsonRpcResult } from "ethers";

// Public Fuji RPCs occasionally stall. ethers waits 300 s per call by default, which is far beyond
// a serverless function's limit, so every server-side call gets a short timeout and a backup RPC.
const RPC_TIMEOUT_MS = 15_000;
const FUJI_BACKUP_RPC = "https://avalanche-fuji-c-chain-rpc.publicnode.com";

class ResilientJsonRpcProvider extends JsonRpcProvider {
  readonly #urls: string[];
  constructor(urls: string[], chainId: number, options: JsonRpcApiProviderOptions = {}) {
    super(urls[0], chainId, { batchMaxCount: 1, staticNetwork: true, ...options });
    this.#urls = urls;
  }
  async _send(payload: JsonRpcPayload | Array<JsonRpcPayload>): Promise<Array<JsonRpcResult>> {
    let lastError: unknown;
    for (const url of this.#urls) {
      const request = new FetchRequest(url);
      request.timeout = RPC_TIMEOUT_MS;
      request.setHeader("content-type", "application/json");
      request.body = JSON.stringify(payload);
      try {
        const response = await request.send();
        response.assertOk();
        const body = response.bodyJson;
        const results = (Array.isArray(body) ? body : [body]) as Array<JsonRpcResult & { error?: { message?: string } }>;
        // A retried broadcast that the first RPC already accepted is a success, not a failure.
        const single = Array.isArray(payload) ? null : payload;
        if (single?.method === "eth_sendRawTransaction" && results[0]?.error?.message && /already known|known transaction/i.test(results[0].error.message)) {
          return [{ id: single.id, result: keccak256(String((single.params as unknown[])[0])) }];
        }
        return results;
      } catch (error) { lastError = error; }
    }
    throw lastError;
  }
}

export function resilientProvider(primary: string | undefined, chainId: number, backups: string[] = []) {
  const urls = [...new Set([primary, ...backups].filter((url): url is string => Boolean(url)))];
  if (!urls.length) throw new Error("No RPC URL configured.");
  return new ResilientJsonRpcProvider(urls, chainId);
}

export function fujiProvider() {
  return resilientProvider(process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc", 43113, ["https://api.avax-test.network/ext/bc/C/rpc", FUJI_BACKUP_RPC]);
}
