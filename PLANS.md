# Smart Bounty Verifier rebuild plan

## Active mode

BUILDER. The UI phase switches to DESIGN while preserving this contract plan.

## Why GenLayer is required

The consensus-critical question is whether an immutable GitHub submission satisfies each natural-language bounty requirement. Presence checks can be deterministic, but requirement interpretation is not. GenLayer keeps the evidence retrieval, LLM judgment, and independent validator execution inside the Intelligent Contract so no single reviewer controls the stored verdict.

## Product scope

This project verifies GitHub repository submissions. It is not an escrow, payout, or marketplace contract.

## Contract invariants

- Bounty IDs are unique and monotonic.
- A bounty has 1-8 bounded requirements.
- Threshold is 1-100 percent and is stored as a required pass count.
- Source evidence is HTTPS and restricted to exact trusted GitHub hosts.
- Submission evidence must include an immutable 40-character commit hash.
- Only `SUBMITTED` bounties can be verified.
- Storage changes occur only after consensus returns a normalized result.
- `VERIFIED` requires a `PASS` result with no unclear requirements.
- Evidence failures or unclear judgments become `INCONCLUSIVE`, never `VERIFIED`.
- Rejected or inconclusive bounties may be resubmitted; attempt count is monotonic.

## Non-deterministic boundary

Leader:

1. Fetch bounded source and immutable submission evidence.
2. Fail closed to a normalized `INCONCLUSIVE` result when evidence is unavailable.
3. Ask the LLM for one decision per requirement.
4. Normalize results to `PASS`, `FAIL`, or `UNCLEAR`.
5. Derive counts and overall verdict without trusting model-provided totals.

Validator:

1. Reject non-return leader results.
2. Independently repeat evidence retrieval and LLM judgment.
3. Compare evidence digest, requirement ordering, normalized decisions, counts, and verdict.
4. Ignore free-form reason wording.
5. Disagree on any consensus-critical mismatch.

## Failure policy

- Invalid input: deterministic `UserError`.
- Unavailable or empty evidence: consensus result `INCONCLUSIVE`.
- Malformed LLM output: normalized `INCONCLUSIVE`.
- Leader/validator disagreement: no state mutation.
- Frontend RPC/wallet/receipt failure: explicit error state, never success.

## Files in this rebuild

- `contracts/smart_bounty_verifier.py`
- `tests/test_contract_logic.py`
- `frontend/index.html`
- `frontend/app.js`
- `frontend/styles.css`
- `package.json`
- `package-lock.json`
- `vite.config.js`
- `README.md`
- `docs/architecture.md`
- `docs/evidence-checklist.md`
- `requirements.txt`
- `.gitignore`

## Exit criteria

- Contract source parses and contract-aware tests pass.
- Consensus agreement, disagreement, malformed output, ambiguity, unavailable evidence, and serialization are tested.
- Frontend dependencies are pinned and the production build succeeds.
- UI has no hard-coded deployment address and requires explicit successful execution receipts.
- UI covers idle, loading, empty, partial, success, rejected, inconclusive, integration-unavailable, and error states.
- Browser smoke test passes for the undeployed configuration without invented live data.
- Deployment remains explicitly unverified until the current source is deployed and matched by hash.
