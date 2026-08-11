import test from "node:test";
import assert from "node:assert/strict";
import {
  connectInjectedWallet,
  discoverInjectedProvider,
  prepareProviderNetwork,
  requestWalletAccount,
  subscribeProvider,
} from "../frontend/wallet-provider.js";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const NETWORK = {
  chain: {
    id: 61999,
    name: "GenLayer Studio",
    rpcUrls: { default: { http: ["https://studio.genlayer.com/api"] } },
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  },
  explorer: "https://explorer-studio.genlayer.com",
};

function recordingProvider(responses = {}) {
  const calls = [];
  const listeners = new Map();
  return {
    calls,
    listeners,
    async request({ method, params }) {
      calls.push({ method, params });
      const response = responses[method];
      if (response instanceof Error) throw response;
      return typeof response === "function"
        ? response({ method, params, calls })
        : response;
    },
    on(name, listener) {
      listeners.set(name, listener);
    },
    removeListener(name, listener) {
      if (listeners.get(name) === listener) listeners.delete(name);
    },
  };
}

function announcingTarget(provider) {
  const listeners = new Map();
  return {
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    removeEventListener(name, listener) {
      if (listeners.get(name) === listener) listeners.delete(name);
    },
    dispatchEvent(event) {
      if (event.type === "eip6963:requestProvider") {
        listeners.get("eip6963:announceProvider")?.({
          detail: { provider, info: { rdns: "wallet.example" } },
        });
      }
      return true;
    },
  };
}

test("selects a standard window.ethereum provider without Snap methods", async () => {
  const provider = recordingProvider();
  assert.equal(await discoverInjectedProvider({ ethereum: provider }), provider);
});

test("falls back to an EIP-6963 announced provider", async () => {
  const provider = recordingProvider();
  assert.equal(
    await discoverInjectedProvider({
      ethereum: null,
      eventTarget: announcingTarget(provider),
      announcementWindowMs: 0,
    }),
    provider,
  );
});

test("returns null when no standard injected provider is available", async () => {
  assert.equal(await discoverInjectedProvider({ ethereum: null }), null);
});

test("requests and normalizes the first wallet account", async () => {
  const provider = recordingProvider({ eth_requestAccounts: [ACCOUNT.toUpperCase()] });
  assert.equal(await requestWalletAccount(provider), ACCOUNT);
  assert.deepEqual(provider.calls.map(({ method }) => method), ["eth_requestAccounts"]);
});

test("rejects an invalid account response", async () => {
  const provider = recordingProvider({ eth_requestAccounts: ["not-an-address"] });
  await assert.rejects(
    requestWalletAccount(provider),
    /did not return a valid account/i,
  );
});

test("preserves a wallet rejection error", async () => {
  const rejection = Object.assign(new Error("User rejected the request"), { code: 4001 });
  const provider = recordingProvider({ eth_requestAccounts: rejection });
  await assert.rejects(requestWalletAccount(provider), (error) => error === rejection);
});

test("matching chain uses only eth_chainId", async () => {
  const provider = recordingProvider({ eth_chainId: "0xf22f" });
  await prepareProviderNetwork(provider, NETWORK);
  assert.deepEqual(provider.calls.map(({ method }) => method), ["eth_chainId"]);
});

test("known different chain switches without wallet-specific methods", async () => {
  const provider = recordingProvider({
    eth_chainId: "0x1",
    wallet_switchEthereumChain: null,
  });
  await prepareProviderNetwork(provider, NETWORK);
  assert.deepEqual(provider.calls, [
    { method: "eth_chainId", params: undefined },
    {
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xf22f" }],
    },
  ]);
});

test("unknown chain adds the exact GenLayer network then switches it", async () => {
  const unknown = Object.assign(new Error("Unknown chain"), { code: 4902 });
  let switches = 0;
  const provider = recordingProvider({
    eth_chainId: "0x1",
    wallet_switchEthereumChain: () => {
      switches += 1;
      if (switches === 1) throw unknown;
      return null;
    },
    wallet_addEthereumChain: null,
  });
  await prepareProviderNetwork(provider, NETWORK);
  assert.deepEqual(provider.calls, [
    { method: "eth_chainId", params: undefined },
    {
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xf22f" }],
    },
    {
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0xf22f",
        chainName: "GenLayer Studio",
        rpcUrls: ["https://studio.genlayer.com/api"],
        nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
        blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
      }],
    },
    {
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xf22f" }],
    },
  ]);
});

test("does not hide a network-switch rejection", async () => {
  const rejection = Object.assign(new Error("User rejected network switch"), { code: 4001 });
  const provider = recordingProvider({
    eth_chainId: "0x1",
    wallet_switchEthereumChain: rejection,
  });
  await assert.rejects(
    prepareProviderNetwork(provider, NETWORK),
    (error) => error === rejection,
  );
});

test("provider subscriptions forward events and can be removed", () => {
  const provider = recordingProvider();
  const seen = [];
  const unsubscribe = subscribeProvider(provider, {
    onAccountsChanged(accounts) {
      seen.push(["accounts", accounts]);
    },
    onChainChanged(chainId) {
      seen.push(["chain", chainId]);
    },
  });
  provider.listeners.get("accountsChanged")?.([ACCOUNT]);
  provider.listeners.get("chainChanged")?.("0xf22f");
  assert.deepEqual(seen, [
    ["accounts", [ACCOUNT]],
    ["chain", "0xf22f"],
  ]);
  unsubscribe();
  assert.equal(provider.listeners.size, 0);
});

test("connects a standard provider and gives it to the wallet client", async () => {
  const provider = recordingProvider({
    eth_requestAccounts: [ACCOUNT],
    eth_chainId: "0xf22f",
  });
  const result = await connectInjectedWallet({
    ethereum: provider,
    network: NETWORK,
    createWalletClient(config) {
      return Object.freeze({ ...config, kind: "wallet-client" });
    },
  });
  assert.equal(result.provider, provider);
  assert.equal(result.account, ACCOUNT);
  assert.equal(result.client.provider, provider);
  assert.equal(result.client.account, ACCOUNT);
  assert.equal(result.client.chain, NETWORK.chain);
  assert.equal(result.client.kind, "wallet-client");
  assert.deepEqual(provider.calls.map(({ method }) => method), [
    "eth_requestAccounts",
    "eth_chainId",
  ]);
});

