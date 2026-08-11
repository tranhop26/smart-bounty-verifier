# Standard EIP-1193 Wallet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the MetaMask Snap-only frontend path with a tested standard EIP-1193 wallet integration through `genlayer-js`, then collect local and live evidence needed for Vercel redeploy and steward resubmission.

**Architecture:** Put wallet discovery, account request, network preparation, and provider subscription in a DOM-independent `frontend/wallet-provider.js` module. `frontend/app.js` will keep UI and GenLayer client state, consume that module, and preserve the existing source-match, receipt, execution-result, and state-readback gates. The Intelligent Contract and deployed address remain unchanged.

**Tech Stack:** Browser JavaScript modules, EIP-1193/EIP-6963, `genlayer-js@1.1.8`, Node test runner, Python unittest contract harness, Vite 8.

## Global Constraints

- Do not call `wallet_getSnaps` or `wallet_requestSnaps` anywhere.
- Do not filter injected providers by MetaMask-specific flags.
- Pass the selected EIP-1193 provider to `createClient({ chain, account, provider })`.
- Keep writes disabled until live source and bundled source hashes match.
- Keep receipt execution validation and post-transaction state readback unchanged.
- Do not modify or redeploy `contracts/smart_bounty_verifier.py`.
- Do not push GitHub or deploy Vercel without action-time identity confirmation.
- Studionet value is simulated; the verification contract holds and transfers no funds.

---

### Task 1: Standard provider discovery and network preparation

**Files:**
- Create: `frontend/wallet-provider.js`
- Create: `tests/wallet-provider.test.mjs`

**Interfaces:**
- Produces: `discoverInjectedProvider({ ethereum, eventTarget, announcementWindowMs }) -> Promise<EIP1193Provider | null>`
- Produces: `prepareProviderNetwork(provider, network) -> Promise<void>`
- Produces: `requestWalletAccount(provider) -> Promise<string>`
- Produces: `subscribeProvider(provider, { onAccountsChanged, onChainChanged }) -> () => void`
- Produces: `connectInjectedWallet({ ethereum, eventTarget, network, createWalletClient }) -> Promise<{ provider, account, client }>`
- Consumes: a GenLayer network object with `chain` and optional `explorer`.

- [ ] **Step 1: Read the good-test rules before adding tests**

Read `C:/Users/admin/.codex/skills/test-driven-development/writing-good-tests.md` completely and apply its production-change and real-behavior checks.

- [ ] **Step 2: Write failing provider tests**

Create `tests/wallet-provider.test.mjs` with a small recording provider and event target. Cover the exact standard behavior:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverInjectedProvider,
  connectInjectedWallet,
  prepareProviderNetwork,
  requestWalletAccount,
  subscribeProvider,
} from "../frontend/wallet-provider.js";

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
      return typeof response === "function" ? response({ method, params, calls }) : response;
    },
    on(name, listener) { listeners.set(name, listener); },
    removeListener(name, listener) {
      if (listeners.get(name) === listener) listeners.delete(name);
    },
  };
}

test("selects a standard window.ethereum provider without Snap methods", async () => {
  const provider = recordingProvider();
  assert.equal(await discoverInjectedProvider({ ethereum: provider }), provider);
});

test("requests and normalizes the first wallet account", async () => {
  const provider = recordingProvider({
    eth_requestAccounts: ["0x1111111111111111111111111111111111111111"],
  });
  assert.equal(
    await requestWalletAccount(provider),
    "0x1111111111111111111111111111111111111111",
  );
  assert.deepEqual(provider.calls.map(({ method }) => method), ["eth_requestAccounts"]);
});

test("matching chain uses only eth_chainId", async () => {
  const provider = recordingProvider({ eth_chainId: "0xf22f" });
  await prepareProviderNetwork(provider, NETWORK);
  assert.deepEqual(provider.calls.map(({ method }) => method), ["eth_chainId"]);
});

test("known different chain switches without requesting Snaps", async () => {
  const provider = recordingProvider({
    eth_chainId: "0x1",
    wallet_switchEthereumChain: null,
  });
  await prepareProviderNetwork(provider, NETWORK);
  assert.deepEqual(provider.calls.map(({ method }) => method), [
    "eth_chainId",
    "wallet_switchEthereumChain",
  ]);
  assert.equal(provider.calls.some(({ method }) => /Snaps/i.test(method)), false);
});

test("unknown chain adds then switches it", async () => {
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
  assert.deepEqual(provider.calls.map(({ method }) => method), [
    "eth_chainId",
    "wallet_switchEthereumChain",
    "wallet_addEthereumChain",
    "wallet_switchEthereumChain",
  ]);
});

test("provider subscriptions can be removed", () => {
  const provider = recordingProvider();
  const unsubscribe = subscribeProvider(provider, {
    onAccountsChanged() {},
    onChainChanged() {},
  });
  assert.equal(provider.listeners.size, 2);
  unsubscribe();
  assert.equal(provider.listeners.size, 0);
});

test("connects a standard provider and gives it to the wallet client", async () => {
  const provider = recordingProvider({
    eth_requestAccounts: ["0x1111111111111111111111111111111111111111"],
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
  assert.equal(result.account, "0x1111111111111111111111111111111111111111");
  assert.equal(result.client.provider, provider);
  assert.equal(result.client.account, result.account);
  assert.equal(result.client.chain, NETWORK.chain);
  assert.equal(result.client.kind, "wallet-client");
  assert.deepEqual(provider.calls.map(({ method }) => method), [
    "eth_requestAccounts",
    "eth_chainId",
  ]);
});
```

Add separate assertions for missing providers, invalid account responses, and user rejection code `4001` without changing the original provider error.

- [ ] **Step 3: Run the provider test and verify RED**

Run: `node --test tests/wallet-provider.test.mjs`

Expected: FAIL because `frontend/wallet-provider.js` does not exist. This is the intended regression proof.

- [ ] **Step 4: Implement the minimum provider module**

Create `frontend/wallet-provider.js`. The implementation must validate only the standard `request` interface, deduplicate candidates, listen briefly for EIP-6963 announcements, and export the five interfaces above. `connectInjectedWallet` must exercise discovery, account request, network preparation, and wallet-client creation as one observable behavior. Network preparation must use this sequence only:

```js
const activeChainId = await provider.request({ method: "eth_chainId" });
if (activeChainId.toLowerCase() !== expectedChainId.toLowerCase()) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: expectedChainId }],
    });
  } catch (error) {
    if (!isUnknownChainError(error)) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [chainParams],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: expectedChainId }],
    });
  }
}
```

It must not reference MetaMask or Snaps.

- [ ] **Step 5: Run the provider test and verify GREEN**

Run: `node --test tests/wallet-provider.test.mjs`

Expected: all provider tests pass with zero warnings.

- [ ] **Step 6: Commit the isolated adapter**

```text
git add frontend/wallet-provider.js tests/wallet-provider.test.mjs
git commit -m "test: cover standard EIP-1193 wallet providers"
```

---

### Task 2: Integrate the selected provider with `genlayer-js`

**Files:**
- Modify: `frontend/app.js:1-216`
- Modify: `frontend/app.js:700-749`
- Modify: `frontend/app.js:1029-1058`
- Test: `tests/wallet-provider.test.mjs`

**Interfaces:**
- Consumes: `connectInjectedWallet` and `subscribeProvider` from `frontend/wallet-provider.js`.
- Produces: a write client created with the discovered provider and account.
- Maintains: `state.walletProvider`, `state.walletAddress`, `state.writeClient`, and one provider unsubscribe callback.

- [ ] **Step 1: Replace the Snap-only path using the tested adapter**

In `frontend/app.js`:

- Import `connectInjectedWallet` and `subscribeProvider`.
- Delete `GENLAYER_SNAP_ID`, `addProviderCandidate`, `findMetaMaskProvider`,
  `walletErrorCode`, `isUnknownChainError`, and `prepareMetaMask`.
- Add `walletUnsubscribe: null` to state.
- In `connectWallet`, discover the provider, request its account, prepare its
  network, construct `createClient({ chain, account, provider })`, subscribe to
  its lifecycle events, and only then publish wallet-ready state.
- On every connection failure or reset, invoke and clear the previous
  unsubscribe callback.
- Replace the bottom-level `window.ethereum.on(...)` block with callbacks bound
  by `subscribeProvider` to the selected provider.

The core success path must be:

```js
const { provider, account, client: writeClient } = await connectInjectedWallet({
  ethereum: window.ethereum,
  eventTarget: window,
  network: currentNetwork(),
  createWalletClient: ({ chain, account, provider }) =>
    createClient({ chain, account, provider }),
});
```

Do not call `writeClient.connect()` because `genlayer-js@1.1.8` implements that
method with a MetaMask Snap requirement. The explicit standard network
preparation is intentional and covered by tests.

- [ ] **Step 2: Run the wallet behavior tests after app integration**

Run: `node --test tests/wallet-provider.test.mjs`

Expected: all standard-provider behavior tests remain green.

- [ ] **Step 3: Build the real application integration**

Run: `npm run build`

Expected: Vite resolves the new module and exits 0.

- [ ] **Step 4: Run the complete test suite**

Run: `npm test`

Expected: the 16 Python contract tests, 6 receipt tests, and all new wallet
tests pass.

- [ ] **Step 5: Commit the frontend integration**

```text
git add frontend/app.js
git commit -m "fix: support standard EIP-1193 wallets"
```

---

### Task 3: Update wallet-facing copy and repository evidence

**Files:**
- Modify: `frontend/index.html:126-129`
- Modify: `README.md:23-28`
- Modify: `docs/architecture.md:80-97`
- Modify: `docs/evidence-checklist.md:37-48`
- Modify: `docs/deployment-evidence.md`
- Verify: browser DOM and the full automated suite.

**Interfaces:**
- Consumes: the implemented standard EIP-1193 connection behavior.
- Produces: accurate reviewer-facing setup and verification guidance.

- [ ] **Step 1: Update copy and evidence checklist**

Use wallet-neutral copy. README prerequisites must say:

```text
- A browser wallet exposing a standard EIP-1193 provider (`window.ethereum`)
```

Architecture must explain that the selected injected provider is passed to
`genlayer-js` without wallet-specific extensions. Add checklist items for a
provider without Snap methods, network switching, account-change invalidation,
and live transaction/state readback. Add a dated frontend-fix section to
deployment evidence while preserving the original contract deployment facts.

- [ ] **Step 2: Verify rendered copy and controls in the local browser**

Open the local app and inspect its rendered DOM. Confirm the enabled control is
named `Connect wallet`, connection status mentions standard account/network
approval, and no visible error or instruction requires MetaMask or Snaps.

- [ ] **Step 3: Build the production artifact**

Run: `npm run build`

Expected: Vite exits 0 and produces `dist/index.html` plus hashed assets.

- [ ] **Step 4: Commit documentation and copy**

```text
git add frontend/index.html README.md docs/architecture.md docs/evidence-checklist.md docs/deployment-evidence.md
git commit -m "docs: document injected wallet support"
```

---

### Task 4: Verify locally in a browser with a standard provider

**Files:**
- No production file changes expected.
- Update only tests or docs if verification exposes a reproducible defect, using a new red-green cycle.

**Interfaces:**
- Consumes: the Vite development server and Chrome's injected wallet.
- Produces: browser evidence for wallet detection, network preparation, and write readiness.

- [ ] **Step 1: Start the local app**

Run: `npm run dev -- --host 127.0.0.1`

Record the exact local URL. Keep the process running only for this verification.

- [ ] **Step 2: Inspect the local page before wallet access**

Using the user-authorized Chrome session, open the local URL, connect reads,
and verify the source-matched Studionet deployment loads without console errors.

- [ ] **Step 3: Connect the injected wallet**

Click `Connect wallet`, approve the account/network request in Chrome, and
verify the UI displays the account without any Snap request or error. Record
the wallet address and active chain ID shown by the provider for the evidence
report. Do not read secrets, recovery phrases, private keys, or unrelated
wallet data.

- [ ] **Step 4: Verify invalidation behavior**

Confirm that an account or chain change clears write readiness and requires an
explicit reconnect. Restore Studionet and reconnect before the transaction
test.

- [ ] **Step 5: Stop the local server after browser verification**

Terminate only the recorded development-server process. Do not terminate
unrelated Node processes.

---

### Task 5: Execute one harmless Studionet write and capture proof

**Files:**
- Modify: `docs/deployment-evidence.md`

**Interfaces:**
- Consumes: the user-approved Chrome wallet, Studionet contract
  `0x1eF77713442c7BFC1eE4e91D643B6e780C8FAB84`, and source-matched local app.
- Produces: transaction hash, successful execution evidence, and state readback.

- [ ] **Step 1: Define the exact harmless transaction**

Use `create_bounty` only, with one bounded requirement and the public project
repository URL. Before signature, verify contract address, Studionet chain ID
`61999`, method, arguments, zero value, and selected account in the wallet UI.

- [ ] **Step 2: Submit through the standard provider**

Approve the zero-value transaction in Chrome. Capture the returned 32-byte
transaction hash. If the wallet shows a different contract, chain, method, or
nonzero value, reject the request and stop.

- [ ] **Step 3: Verify receipt and state readback**

Wait for the app to reach its receipt/execution/readback success state. Verify
the transaction on the Studionet explorer and confirm `get_stats().total`
increased by exactly one and the new bounty is `OPEN` with the intended source
URL.

- [ ] **Step 4: Record fixed evidence**

Append the date, wallet type, account, transaction hash, receipt status,
execution result, resulting bounty ID, and readback summary to
`docs/deployment-evidence.md`. Do not claim full create-submit-verify evidence
for this frontend regression unless those additional transactions are actually
performed.

- [ ] **Step 5: Commit the live verification record**

```text
git add docs/deployment-evidence.md
git commit -m "docs: record standard wallet transaction proof"
```

---

### Task 6: Final verification and redeploy handoff

**Files:**
- Review all changed files.
- No generated `dist/` commit unless repository policy already tracks it.

**Interfaces:**
- Produces: clean local branch, proof summary, suggested commit/push/deploy actions, and known limitations.

- [ ] **Step 1: Run fresh full verification**

Run: `npm run check`

Expected: all Python and JavaScript tests pass and production build exits 0.

- [ ] **Step 2: Inspect dependency risk without mutating the lockfile**

Run: `npm audit --omit=dev` and `npm audit`.

Record whether the existing three high-severity findings affect production or
only development tooling. Do not run `npm audit fix` automatically.

- [ ] **Step 3: Check repository hygiene**

Run:

```text
git status --short
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git log --oneline origin/main..HEAD
```

Confirm no secrets, `.env.local`, `.vercel`, `node_modules`, `dist`, browser
profiles, screenshots containing wallet details, chat logs, or local task files
are staged or untracked for publication.

- [ ] **Step 4: Assemble the completion proof matrix**

Report the exact local commit, contract source hash, unchanged contract address
and deployment transaction, test/build results, browser wallet result, new
transaction/readback evidence, and limitations. Distinguish local verification
from the still-old Vercel deployment.

- [ ] **Step 5: Stop before external publication**

Check Git author, active GitHub CLI account, repository owner/remote, Vercel
project/team, and proposed branch/commit. Ask the user to confirm those exact
identities and the exact `git push` and Vercel deployment actions. Do not push,
deploy, or resubmit before confirmation.
