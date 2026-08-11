# Standard EIP-1193 Wallet Design

## Goal

Replace the frontend's MetaMask Snap-only connection path with a standard
EIP-1193 injected-provider path supported by `genlayer-js`, while preserving
the existing source-match, receipt, execution-result, and state-readback
proof gates.

## Scope

This change affects only browser wallet discovery, connection, event handling,
copy, tests, and supporting documentation. It does not change the Intelligent
Contract, its deployed source, the Studionet address, or the contract state
machine.

## GenLayer decision and consequence

The exact decision remains: for each requirement recorded in a bounty, does
the immutable GitHub submission at the stored 40-character commit satisfy the
requirement according to independent GenLayer validator review?

The exact on-chain consequence remains a state transition from `SUBMITTED` to
one of `VERIFIED`, `REJECTED`, or `INCONCLUSIVE`, together with the canonical
decision projection, evidence digest, and counts. The contract does not hold,
transfer, or settle funds.

## Trust matrix

| Actor | Cannot trust | Can manipulate | Contract defense | Test or evidence |
|---|---|---|---|---|
| Bounty creator | Submitter | Mutable branches, misleading evidence, requirement wording | Submission must bind to a full Git commit; inputs are bounded and host-restricted | Contract URL and state-transition tests |
| Submitter | Creator or verification caller | Caller timing and resubmission choice | Caller cannot provide the verdict; the contract derives it through validator consensus | Consensus and authorization/state tests |
| Validator | Fetched pages or model output | Prompt injection, malformed output, missing evidence | Evidence is marked untrusted; counts and verdict are recomputed; uncertainty becomes `INCONCLUSIVE` | Malformed, unavailable, injection, and disagreement tests |
| Reviewer or wallet user | Frontend | UI could claim success or point at different code | Writes remain disabled until deployed source hash matches; success requires receipt plus contract-state readback | Live source match, receipt tests, and browser verification |
| Frontend | Injected wallet | Account, active chain, rejection, unsupported optional methods | Use only standard EIP-1193 methods; invalidate the write client on account or chain change | Wallet adapter regression tests with fake providers and live browser test |

## Evidence binding

- Source provenance: HTTPS `github.com` or `raw.githubusercontent.com` URL.
- Subject: the stored bounty ID and its stored requirements.
- Submission identity and version: repository path plus full 40-character Git
  commit embedded in the submission URL.
- Submitter identity: `gl.message.sender_address` stored on submission.
- Observation time: the contract verification transaction and its accepted or
  finalized receipt; the current contract does not store a separate wall-clock
  timestamp.
- Freshness: Git commit evidence is immutable; a new attempt requires a new
  submission transition and increments `attempt_count`.
- Replay domain: deployed chain, contract address, bounty ID, stored submission,
  and attempt count.
- Integrity: the contract stores the commit and hashes the canonical source URL,
  rendered source content, submission URL, and rendered submission content.
- Failure: unavailable, empty, malformed, contradictory, or unclear evidence
  cannot become approval and resolves to `INCONCLUSIVE` or a non-mutating failed
  consensus transaction.

## State machine and contract classification

The existing transitions remain:

```text
create -> OPEN
OPEN | REJECTED | INCONCLUSIVE --submit--> SUBMITTED
SUBMITTED --verify/pass--> VERIFIED
SUBMITTED --verify/fail--> REJECTED
SUBMITTED --verify/unclear--> INCONCLUSIVE
```

`VERIFIED` is terminal in the current contract. `REJECTED` and `INCONCLUSIVE`
may be resubmitted. Invalid transitions fail without advancing state. The
deployed contract is `INTENTIONALLY_FROZEN`; this frontend-only change neither
adds an upgrade path nor requires a contract redeployment. Recovery from a
future contract defect requires deploying a new reviewed source and updating
the explicit frontend deployment configuration with new evidence.

## Provider architecture

Create a focused wallet-provider module used by `frontend/app.js`.

The module will:

1. Accept any object implementing the EIP-1193 `request` function.
2. Collect injected candidates from `window.ethereum`,
   `window.ethereum.providers`, and EIP-6963 announcements.
3. Prefer the primary `window.ethereum` provider when it is valid, then fall
   back to the first valid announced provider. It will not inspect MetaMask
   flags or require wallet-specific methods.
4. Request accounts with `eth_requestAccounts`.
5. Read `eth_chainId`, use `wallet_switchEthereumChain`, and use
   `wallet_addEthereumChain` only after the standard unknown-chain error.
6. Never call `wallet_getSnaps` or `wallet_requestSnaps`.
7. Return the selected provider and normalized account for construction of
   `createClient({ chain, account, provider })`.

`frontend/app.js` remains responsible for UI state and creates the write client
only after the existing read connection and source-match gates pass.

## Provider lifecycle

Event listeners will be attached to the selected provider when available.
Previous selected-provider listeners will be removed before replacement when
the provider implements `removeListener`. An `accountsChanged` or
`chainChanged` event invalidates `writeClient`, `walletProvider`, and
`walletAddress`, disables write actions, and requires an explicit reconnect.

The UI will say "Connect wallet" and describe standard account/network
approval. Errors will distinguish no injected provider, user rejection,
unsupported network switching, and other provider failures without mentioning
Snaps.

## Transaction proof flow

The existing proof flow remains authoritative:

1. Validate local inputs.
2. Request the wallet signature through the selected EIP-1193 provider.
3. Submit with the wallet-backed `genlayer-js` client.
4. Wait for the configured transaction status.
5. Require successful execution or accepted canonical Studionet consensus.
6. Read contract state and verify the expected transition.
7. Only then display success and the transaction hash.

## Testing

Implementation will follow red-green-refactor.

Automated wallet tests will prove:

- A standard `window.ethereum` provider without Snap methods is selected.
- No Snap method is called during connection or network preparation.
- `eth_requestAccounts` supplies the account passed to `genlayer-js`.
- A matching chain does not trigger add or switch calls.
- A different known chain triggers a switch.
- Error 4902 triggers add followed by switch.
- User rejection and missing-provider errors fail closed.
- Account and chain changes invalidate the write connection.

The full Python contract suite, JavaScript tests, production build, and audit
will be rerun. Browser verification will cover live reads, source match,
wallet connection in the user-authorized Chrome session, one harmless
Studionet write, its receipt, and contract-state readback. The write will not
be attempted if the selected wallet, network, account, or transaction details
cannot be verified at action time.

## Delivery and external-action gates

The local change will be prepared with a clean diff, test output, build output,
known limitations, and updated redeploy/resubmission notes. No GitHub push or
Vercel deployment will occur until the user confirms the exact GitHub account,
repository remote, Vercel team/project, and proposed action at that time.
