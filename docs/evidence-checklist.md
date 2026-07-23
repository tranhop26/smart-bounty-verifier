# Deployment Evidence Checklist

Use this checklist before claiming that the current source tree is fully review-ready.

## Required deployment evidence

1. Deploy the current `contracts/smart_bounty_verifier.py` source to the intended GenLayer network.
2. Record the deployed contract address.
3. Record at least one successful transaction hash for each workflow:
   - `create_bounty`
   - `submit`
   - `verify`
4. For each transaction, keep the receipt or Explorer page showing:
   - transaction hash
   - target contract address
   - final status
   - execution result
5. Confirm that the frontend is configured to the same network and exact contract address.

## Required state evidence

After the live flow runs, verify:

1. `get_stats()` returns values that match the dashboard.
2. `get_all_bounties()` returns entries that match the list view.
3. `get_bounty(bounty_id)` returns a state object that matches the inspect view.
4. The `verdict_json` shown in the inspect view matches the contract state returned by `get_bounty(...)`.

## Rule-sensitive checks

Before submitting for review, explicitly confirm:

1. No demo or fallback data is shown when reads fail.
2. Success is shown only after a real transaction receipt exists.
3. The deployed contract is this source tree, not an older revision.
4. The verify flow still fails closed when evidence URLs are unreachable or empty.
5. The URLs used in create and submit are public and do not target localhost, private IP space, or metadata endpoints.

## Reviewer handoff pack

Prepare the following together:

- repository commit or source archive
- deployed contract address
- create transaction hash
- submit transaction hash
- verify transaction hash
- one screenshot or recorded proof of the frontend using that same address

Without these artifacts, the project may still land in `REQUEST_MORE_INFO` even if the local source code looks correct.
