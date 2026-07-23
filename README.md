# Smart Bounty Verifier

Smart Bounty Verifier is a GenLayer intelligent contract for bounty review. A creator posts requirements and a public source URL, a submitter posts a public submission URL, and the contract uses GenLayer web access plus an LLM-based judgment flow to decide whether the submission passed the configured threshold.

## Current posture

This repository is aligned around real GenLayer behavior rather than mocked UI signals:

- The contract rejects non-public URLs, embedded credentials, and `threshold_pct=0`.
- Verification fails closed when submission evidence cannot be fetched or is empty.
- The verifier recomputes `passed_count` from normalized requirement results instead of trusting a model-provided counter.
- The equivalence rule compares structured outcome fields rather than only the top-level verdict string.
- The frontend uses live contract reads and wallet-backed writes through GenLayerJS.
- The frontend waits for a transaction receipt before claiming success.
- The repository no longer treats a previous deployment or demo as proof for the current source tree.

## Contract behavior

Core write methods:

- `create_bounty(requirements_json, source_url, threshold_pct)`
- `submit(bounty_id, submission_url)`
- `verify(bounty_id)`

Core read methods:

- `get_bounty(bounty_id)`
- `get_all_bounties()`
- `get_stats()`

Verification rules:

- Only public `http` and `https` URLs are accepted.
- Localhost, private IP space, link-local hosts, `.local` names, and metadata endpoints are rejected.
- If the submission page cannot be fetched or is empty, the contract records a `FAIL` verdict.
- Final status is `VERIFIED` only when normalized PASS results meet the configured threshold.

## Frontend

The browser dApp in `frontend/index.html` is designed to use official GenLayerJS patterns:

- Reads use `readContract()`.
- Writes use a wallet-backed client with `provider: window.ethereum`.
- Network switching uses `client.connect(...)`.
- State updates are shown only after `waitForTransactionReceipt(...)` returns.

Serve the frontend over HTTP rather than opening it with `file://`.

Example:

```bash
cd frontend
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Before you claim a deployment

This repository does not treat any older deployment as evidence for the current source tree. Before publishing a contract address, redeploy the current contract source and confirm:

1. The deployed bytecode or source corresponds to `contracts/smart_bounty_verifier.py`.
2. The frontend is pointed at that exact address.
3. At least one create, submit, and verify flow succeeds against the intended network.
4. The resulting transaction receipts and bounty state match the UI.

## Local testing

Run the policy-focused tests:

```bash
python -m pytest tests/test_contract_logic.py -v
```

Run a basic contract syntax check:

```bash
python -m py_compile contracts/smart_bounty_verifier.py
```

These checks validate policy and syntax. They do not replace a full runtime test on localnet, studionet, or testnet.

## Dependencies

`requirements.txt` pins:

```text
genlayer==0.2.16
```

## Project structure

```text
smart-bounty-verifier/
|-- contracts/
|   `-- smart_bounty_verifier.py
|-- frontend/
|   `-- index.html
|-- tests/
|   `-- test_contract_logic.py
|-- docs/
|   `-- architecture.md
|-- README.md
`-- requirements.txt
```

## Evidence status

As of July 23, 2026, this repository contains source and tests, but deployment proof for the current source must still be produced manually after redeployment.

## License

MIT
