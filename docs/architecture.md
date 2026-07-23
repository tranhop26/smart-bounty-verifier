# Architecture - Smart Bounty Verifier

## Overview

Smart Bounty Verifier has two moving parts:

1. A GenLayer intelligent contract that stores bounties and performs AI-assisted verification.
2. A browser dApp that reads live contract state and sends wallet-backed write transactions through GenLayerJS.

The system is designed so that the frontend does not invent transaction success, fabricated state, or fake verification output.

## Contract state

- `bounties: TreeMap[str, Bounty]`
- `next_id: bigint`

Each `Bounty` stores:

- creator
- requirements JSON
- source URL
- submission URL
- submitter
- status
- verdict JSON
- passed count
- total count
- threshold

## Contract flow

### Create

- Parse the requirements array.
- Reject empty arrays, oversized arrays, empty requirement strings, and invalid thresholds.
- Reject source URLs that are not public `http` or `https` endpoints.
- Store the computed threshold on-chain.

### Submit

- Require the bounty to be `OPEN` or `REJECTED`.
- Reject submission URLs that are not public `http` or `https` endpoints.
- Reset prior verdict fields before moving the bounty to `SUBMITTED`.

### Verify

- Read the stored bounty.
- Fetch the submission page through `gl.nondet.web.render`.
- If the submission page is empty or unreachable, return a fail-closed verdict.
- Optionally fetch source context as secondary evidence.
- Ask the LLM to evaluate each requirement while treating fetched page content as untrusted evidence.
- Normalize every requirement result into `PASS` or `FAIL`.
- Recompute `passed_count` from normalized details.
- Derive the final verdict from the recomputed count and stored threshold.
- Compare leader and validator outputs using structured equivalence rules instead of checking only the top-level verdict string.

## Frontend flow

The browser dApp follows the official GenLayerJS read and write pattern:

- A read client loads dashboard state with `readContract()`.
- A wallet-backed write client uses `provider: window.ethereum`.
- Before writes, the dApp calls `client.connect(...)` for the selected network.
- After each write, the dApp waits for `waitForTransactionReceipt(...)`.
- The UI refreshes state only after the receipt returns and execution does not signal an error result.

## Safety posture

This repository explicitly guards against these failure modes:

- False positive verification caused by `threshold_pct=0`
- Treating unreachable evidence as success
- Trusting model-provided counts over normalized requirement results
- Sending local or private network targets into GenLayer web fetches
- Prompt injection attempts embedded in fetched source or submission content
- Frontend success messages that appear before a real receipt exists
- Static or simulated dashboard data being passed off as live chain state

## Evidence posture

Source and UI can be reviewed locally, but deployment evidence for the current source must be established separately. A contract address should only be published after redeploying this exact source tree and verifying that receipts, contract state, and UI output all match.
