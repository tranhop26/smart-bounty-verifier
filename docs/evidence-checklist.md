# Deployment evidence checklist

Do not describe a build as deployed until every required item below is recorded for the same contract source.

## Provenance

- [ ] Repository commit
- [ ] SHA-256 of `contracts/smart_bounty_verifier.py`
- [ ] Target network
- [ ] Contract address
- [ ] Deployment transaction or Studio record
- [ ] Live deployed source matches the bundled source in the UI

## End-to-end receipts

- [ ] `create_bounty` transaction hash and finished receipt
- [ ] `submit` transaction hash and finished receipt
- [ ] `verify` transaction hash and finished receipt
- [ ] Final `get_bounty` response
- [ ] Final `get_stats` response

Every item must point to the same network and contract address. A historical demo, older deployment, or screenshot without its address is not sufficient.

## Adversarial checks

- [ ] Threshold `0` is rejected
- [ ] More than eight requirements is rejected
- [ ] Non-HTTPS and non-GitHub evidence is rejected
- [ ] Lookalike domains, credentials, custom ports, and URL fragments are rejected
- [ ] A branch or short commit submission is rejected
- [ ] Unavailable evidence becomes `INCONCLUSIVE`
- [ ] Malformed or incomplete model output becomes `INCONCLUSIVE`
- [ ] A clear below-threshold review becomes `REJECTED`
- [ ] A leader-validator decision mismatch does not mutate state
- [ ] Prompt-like text inside evidence is treated as data

## UI checks

- [ ] No demo data appears when reads fail
- [ ] Wallet writes are disabled before source match
- [ ] Changing contract/network clears stale state
- [ ] Changing wallet account requires reconnecting
- [ ] Success appears only after receipt and confirming state read
- [ ] Transaction hash and final status remain visible
- [ ] Layout works at 320, 375, 414, 768, and desktop widths
- [ ] Keyboard tab navigation and focus indicators are usable

## Handoff record

```text
Repository commit:
Contract source SHA-256:
Network:
Contract address:
Deployment transaction:
Create transaction:
Submit transaction:
Verify transaction:
Verified bounty ID:
Reviewer:
Date:
```
