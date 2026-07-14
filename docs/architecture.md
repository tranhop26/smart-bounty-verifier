# Architecture -- Smart Bounty Verifier

## Overview

Smart Bounty Verifier is an Intelligent Contract deployed on GenLayer that combines:
1. **On-chain state management** -- bounty data stored in TreeMap
2. **AI-powered verification** -- LLM evaluates requirements
3. **Web connectivity** -- fetches real web pages for analysis
4. **Decentralized consensus** -- multiple validators must agree

## Contract State

- `bounties: TreeMap[str, Bounty]` -- Maps bounty ID to serialized Bounty objects
- `next_id: bigint` -- Auto-incrementing bounty ID counter

## Core Methods

### Write Methods

| Method | Parameters | Description |
|--------|-----------|-------------|
| `create_bounty` | requirements_json, source_url, threshold_pct | Creates new bounty |
| `submit` | bounty_id, submission_url | Submit work for a bounty |
| `verify` | bounty_id | AI-powered verification with consensus |

### Read Methods

| Method | Parameters | Description |
|--------|-----------|-------------|
| `get_bounty` | bounty_id | Get single bounty details |
| `get_all_bounties` | -- | List all bounties |
| `get_stats` | -- | Aggregate statistics |

## Consensus Flow

1. Leader node executes `verify()`, fetches web page, calls LLM.
2. Each Validator independently fetches the same URL and calls its local LLM.
3. Validators evaluate the leader's proposed verdict JSON using the custom validator rule:
   - Must have the identical `verdict` value ("PASS" or "FAIL").
   - Requirement counts (`passed_count`) must match within a +/-1 tolerance.
4. If consensus is reached, the transaction is ACCEPTED and contract state is updated.

## Data Flow
```
               Input: bounty_id
                      │
                      ▼
             Load bounty from TreeMap
                      │
                      ▼
     Fetch submission_url via gl.nondet.web.render()
                      │
                      ▼
            For each requirement:
    ├── Build LLM prompt with requirement + page content
    ├── Call gl.nondet.exec_prompt() inside run_nondet_unsafe()
    ├── Parse JSON response (PASS/FAIL + reason)
    └── Append to details list
                      │
                      ▼
          Count passed requirements
                      │
                      ▼
            Compare with threshold
                      │
                      ▼
       Update status: VERIFIED or REJECTED
                      │
                      ▼
         Store updated bounty in TreeMap
```
