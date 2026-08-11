# Architecture

## Trust boundary

Smart Bounty Verifier stores a deterministic state machine around one nondeterministic operation: reviewing public GitHub evidence with web access and an LLM.

The browser is not a source of truth. The model is not a source of truth. A visible success message is not a source of truth. The accepted contract receipt and the resulting contract state are the source of truth.

## State model

Each bounty stores:

- creator and submitter
- bounded requirements JSON
- source and submission URLs
- immutable submission commit
- evidence digest
- threshold and attempt count
- pass, fail, unclear, and total counts
- normalized verdict JSON
- one of `OPEN`, `SUBMITTED`, `VERIFIED`, `REJECTED`, or `INCONCLUSIVE`

Valid transitions:

```text
create                         submit
  └── OPEN ────────────────────► SUBMITTED
                                  │
                                  ├── verify + enough PASS ───► VERIFIED
                                  ├── verify + clear failure ─► REJECTED
                                  └── unavailable/ambiguous ──► INCONCLUSIVE
                                      │
                                      └── resubmit ───────────► SUBMITTED
```

## Deterministic input policy

Create requires:

- 1–8 non-empty requirements
- each requirement at most 240 characters
- threshold from 1–100
- an HTTPS source URL on exact host `github.com` or `raw.githubusercontent.com`

Submit additionally requires a `commit`, `tree`, `blob`, or raw URL containing a full 40-character Git commit hash. Credentials, fragments, custom ports, host suffix tricks, and other domains are rejected before any web access.

## Nondeterministic review

The leader:

1. Fetches source and submission evidence independently through GenLayer web access.
2. Bounds both responses before prompting.
3. Labels all fetched content as untrusted evidence and tells the model to ignore embedded instructions.
4. Requests one normalized decision per requirement.
5. Recomputes counts and final status from those decisions.
6. Hashes the exact evidence inputs used for the review.

The validator runs the same review independently. Consensus compares:

- evidence digest
- ordered requirement decisions
- recomputed pass/fail/unclear counts
- total count
- final verdict

Free-form reasons are explanatory and intentionally excluded from consensus. Any decision mismatch rejects the nondeterministic result, so no review state is committed.

## Failure policy

- Evidence fetch or model failure → `INCONCLUSIVE`
- Missing or malformed requirement results → `UNCLEAR`
- Any `UNCLEAR` result → `INCONCLUSIVE`
- All results clear, threshold met → `VERIFIED`
- All results clear, threshold missed → `REJECTED`
- Leader-validator projection mismatch → transaction does not mutate review state

This separates a clear failure from “the system cannot make a defensible decision.”

## Frontend proof flow

The dApp has two connection levels:

1. **Read-only:** validate address, inspect the live schema, fetch deployed source, compare its digest, then load live state.
2. **Wallet writes:** available only when the deployed source matches the bundled reviewed source.

Wallet writes use the standard EIP-1193 interface. The frontend discovers an
injected provider from `window.ethereum`, its provider list, or EIP-6963,
requests an account, prepares the selected GenLayer chain with standard wallet
methods, and passes that same provider to `genlayer-js`. It does not require a
MetaMask Snap or another wallet-specific extension.

For every write, the UI:

1. validates user input locally
2. submits through a wallet-backed GenLayer client
3. displays the real transaction hash
4. waits for a finished receipt
5. reads contract state again
6. confirms the expected state transition

Changing network, contract, chain, or wallet account invalidates the relevant connection and disables stale write controls. Account and chain listeners are bound to the selected provider rather than an unrelated injected wallet.

## Deliberate limits

The contract verifies public evidence at a Git commit. It is not an escrow, payment rail, authorship oracle, general URL crawler, or security audit.
