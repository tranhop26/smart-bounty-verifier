# Smart Bounty Verifier

Smart Bounty Verifier is a GenLayer intelligent contract and browser dApp for reviewing work at an immutable GitHub commit. It records a shared verdict; it does **not** hold funds or pay a bounty.

**Primary public app:** <https://smart-bounty-verifier.vercel.app/>

Fallback mirror: <https://tranhop26.github.io/smart-bounty-verifier/>

## What is protected

- Evidence is limited to exact `github.com` and `raw.githubusercontent.com` hosts over HTTPS.
- Every submission must contain a full 40-character commit hash.
- A bounty needs 1–8 bounded requirements and a threshold from 1–100%.
- The model evaluates every requirement as `PASS`, `FAIL`, or `UNCLEAR`.
- Counts and the final verdict are recomputed by the contract. Model-provided totals are ignored.
- Missing, malformed, or ambiguous evidence becomes `INCONCLUSIVE`, never an accidental pass.
- A validator independently fetches and reviews the evidence, then requires an exact match on the decision projection before state changes.
- The UI compares the live deployed contract source with the bundled reviewed source before enabling wallet writes.
- The UI reports success only after a finished transaction receipt and a confirming state read.

## Run locally

Requirements:

- Node.js 20.19+ or 22.12+
- Python 3.11+
- A browser wallet exposing a standard EIP-1193 provider (`window.ethereum`)

The `genlayer` package on PyPI is an empty placeholder and is not the contract
runtime. GenVM supplies the exact runtime pinned in the contract's first-line
`Depends` header.

```bash
npm install
npm run check
npm run dev
```

Open the local address printed by Vite. The reviewed Studionet deployment is
prefilled, and the app independently checks its live source before enabling
wallet writes. The selected injected provider is passed directly to
`genlayer-js`; no MetaMask Snap or wallet-specific extension is required.

To prefill a reviewed deployment, copy `.env.example` to `.env.local` and set only the address for the intended network:

```text
VITE_STUDIONET_CONTRACT_ADDRESS=
VITE_BRADBURY_CONTRACT_ADDRESS=
VITE_ASIMOV_CONTRACT_ADDRESS=
VITE_LOCALNET_CONTRACT_ADDRESS=
```

An address alone does not unlock writes. The app fetches the deployed source, computes its SHA-256 digest, and compares it with `contracts/smart_bounty_verifier.py`.

## Build and test

```bash
npm run test
npm run build
npm audit
```

The test suite imports the real contract module through a lightweight GenLayer runtime stub. It exercises URL policy, immutable commits, create/submit/verify state transitions, leader-validator agreement and disagreement, malformed model output, unavailable evidence, prompt-injection boundaries, retries, and views.

`dist/` is the static production artifact. Serve it over HTTP; do not open it with `file://`.

## Deploy without breaking provenance

1. Deploy the exact contents of `contracts/smart_bounty_verifier.py`.
2. Record the network, address, source digest, deployment transaction, and repository commit.
3. Put the address in the matching `VITE_*_CONTRACT_ADDRESS` variable.
4. Rebuild the frontend.
5. Connect read-only first. Confirm the UI shows **Source match**.
6. Connect a wallet and run one create → submit → verify flow.
7. Keep the three transaction receipts and the resulting state reads.

Never reuse an older deployment for a newer contract source. If the deployed source differs by even one meaningful character, wallet writes stay disabled.

## Verified Studionet deployment

- Contract: `0x1eF77713442c7BFC1eE4e91D643B6e780C8FAB84`
- Deployment transaction: `0x29d489023b28a5b4e005fa9bb7c0edd3db14c505194bd9698fc9e567abd5b745`
- Reviewed source SHA-256: `f7585b0a118c55f28cd0018811e3545be8a55b0d1039151c20971d977952c728`
- Evidence: `docs/deployment-evidence.md`

## Contract interface

Writes:

- `create_bounty(requirements_json, source_url, threshold_pct)`
- `submit(bounty_id, submission_url)`
- `verify(bounty_id)`

Reads:

- `get_bounty(bounty_id)`
- `get_all_bounties()`
- `get_stats()`

Statuses:

- `OPEN`
- `SUBMITTED`
- `VERIFIED`
- `REJECTED`
- `INCONCLUSIVE`

## Project layout

```text
contracts/smart_bounty_verifier.py  reviewed intelligent contract
frontend/index.html                 accessible application shell
frontend/app.js                     live GenLayer client and proof flow
frontend/styles.css                 responsive interface system
tests/test_contract_logic.py        contract-integrated policy tests
docs/architecture.md                trust and execution model
docs/evidence-checklist.md          deployment handoff checklist
PLANS.md                            implementation decisions and invariants
```

## Scope

This project verifies public GitHub evidence. It does not prove authorship, audit arbitrary external websites, transfer funds, or guarantee that reviewed code is deployed somewhere else.

## License

MIT
