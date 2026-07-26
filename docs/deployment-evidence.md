# Studionet deployment evidence

Verified on 2026-07-26.

## Deployment

- Network: GenLayer Studionet
- Chain ID: `61999`
- Contract: `0x1eF77713442c7BFC1eE4e91D643B6e780C8FAB84`
- Deployment transaction: `0x29d489023b28a5b4e005fa9bb7c0edd3db14c505194bd9698fc9e567abd5b745`
- Deployer: `0x47bCb22167703011df4053f7e3379cc95F068929`
- Normalized local source SHA-256: `f7585b0a118c55f28cd0018811e3545be8a55b0d1039151c20971d977952c728`
- Normalized deployed source SHA-256: `f7585b0a118c55f28cd0018811e3545be8a55b0d1039151c20971d977952c728`
- Source match: yes

## Receipt-backed workflow

- Create bounty: `0xb1bc7d1cbf080e538c2329226a9b76a9f1106e3e05dec67ac464eb99d3924d90`
- Submit immutable commit: `0x5eb84d87821915929e35f63784d9d084e12e3709f5ffdb5bd449941ab5758e53`
- Verify: `0xdb947e81fc9398adae768d242d74d3d55d59b2b3dbf589ace7fdd9976531f03c`

All three transactions reached `FINALIZED` with `MAJORITY_AGREE`.

## Confirmed state

```json
{
  "total": 1,
  "open": 0,
  "submitted": 0,
  "verified": 1,
  "rejected": 0,
  "inconclusive": 0
}
```

Bounty `0`:

- immutable commit: `882c515bfdc1e190a5c22a3083370096a9a23713`
- evidence digest: `41ef231afba8551e30076e6032f715f366edb34bf475dddaf6410bacd7464caf`
- decision: `PASS`
- status: `VERIFIED`
- attempts: `1`

Two earlier create attempts were finalized as contract-level rollbacks while
testing CLI string escaping. They did not mutate state and are not counted as
successful workflow evidence.
