# ClawVault v1 → v2 Upgrade Summary

## Critical Fixes Applied

### 1. EIP-7702 Implementation — FIXED (02-POLICY-ENGINE-v2.md)
- **Problem:** v1 used ethers.js v6 which does NOT support type 0x04 transactions. The `delegateToPolicy()` function was a placeholder that just computed a hash and returned it.
- **Fix:** Rewrote `EIP7702Manager.ts` entirely using **viem** library which has native EIP-7702 support:
  - `walletClient.signAuthorization({ contractAddress })` — signs the delegation
  - `walletClient.sendTransaction({ authorizationList })` — sends the type 0x04 tx
  - `revokeDelegation()` now actually works by delegating to `address(0)`
- **Dependency change:** `ethers@6` → `viem@2.x`

### 2. Real Sepolia USDT (01-SMART-CONTRACTS-v2.md)
- **Problem:** v1 referenced mainnet USDT addresses that don't work on testnet.
- **Fix:** Uses the official Tether USDT deployment on Sepolia: `0x7169D38820dfd117C3FA1f22a697dBA58d90BA06`. Get test tokens from faucets (Bitaps, etc). No mock contracts needed — using real USDT shows production-readiness to judges.

### 3. Dashboard Buttons — WIRED (04-DASHBOARD-v2.md)
- **Problem:** Freeze/Unfreeze/Revoke/Save buttons were UI-only decorations.
- **Fix:** All buttons now call real API endpoints (POST /api/freeze, /api/unfreeze, /api/revoke-session-key, /api/policy). Added confirmation dialogs for destructive actions.

### 4. MCP Server — NEW (03-OPENCLAW-AGENT-v2.md)
- **Problem:** OpenClaw skill was documentation-only. No callable MCP tools.
- **Fix:** Built full MCP server using `@modelcontextprotocol/sdk` with 11 tools: create_wallet, get_balance, transfer, get_policy_status, get_audit_log, update_policy, freeze, unfreeze, create_session_key, revoke_session_key, register_identity.

### 5. ERC-8004 Integration — NEW (03-OPENCLAW-AGENT-v2.md)
- **Problem:** Hackathon uses ERC-8004 for agent identity. v1 had no integration.
- **Fix:** Added `ERC8004Manager` class that registers agents on the Identity Registry (`0x8004A169...`) and reads reputation from the Reputation Registry (`0x8004BAa1...`).

> **Note:** All token addresses now point to real Sepolia USDT (`0x7169D38820dfd117C3FA1f22a697dBA58d90BA06`), not mainnet USDT or mock contracts.

## New Features Added

### 6. Anomaly Detection (02-POLICY-ENGINE-v2.md)
- Velocity checks: max transactions per hour
- Recipient diversity: max unique recipients per hour
- Large transaction flagging: if single tx > N% of daily limit
- Configurable per-agent via `anomalyDetection` policy field

### 7. Risk Scoring (02-POLICY-ENGINE-v2.md)
- Every PolicyDecision now includes `riskScore: number` (0-100)
- Factors: amount vs limit ratio, new vs known recipient, transaction velocity, daily limit proximity
- Displayed in dashboard transaction log with color coding

### 8. Contract Improvements (01-SMART-CONTRACTS-v2.md)
- `execute()` and `executeBatch()` for delegated calls through policy
- Session key enumeration via `getSessionKeyList()` and `getActiveSessionKeyCount()`
- `txCount` tracking per session key for analytics
- Batch allowlist setup (`setTokensAllowedBatch`, `setRecipientsAllowedBatch`)
- Version identifier: `getVersion()` returns "ClawVault-PolicyDelegate-v2"

### 9. Dashboard Improvements (04-DASHBOARD-v2.md)
- Stats bar: total transactions, approval rate, average risk score, volume
- Connection status indicator (Live/Disconnected)
- Risk score display with color coding in transaction log
- Freeze state indicator per agent
- Extracted data fetching into `useClawVault` hook
- Footer with last update timestamp

### 10. Improved Tests (01-SMART-CONTRACTS-v2.md)
- 15+ test cases covering: initialization, session keys, allowlists, emergency controls, recovery
- Tests for edge cases: double init, zero address, short delay, batch operations, txCount

## Files Produced

| File | Description | Lines |
|------|-------------|-------|
| `01-SMART-CONTRACTS-v2.md` | Improved contracts + batch ops + real Sepolia USDT + tests | ~550 |
| `02-POLICY-ENGINE-v2.md` | Viem EIP-7702 fix + anomaly detection + risk scoring | ~550 |
| `03-OPENCLAW-AGENT-v2.md` | MCP server + ERC-8004 + improved demo | ~450 |
| `04-DASHBOARD-v2.md` | Working buttons + risk display + stats bar | ~400 |
| `05-SUBMISSION-CHECKLIST-v2.md` | Updated talking points + new demo script | ~250 |

## Dependency Changes

| Package | v1 | v2 | Reason |
|---------|-----|-----|--------|
| `ethers` | v6 | REMOVED | Doesn't support EIP-7702 |
| `viem` | Not used | v2.x | Native EIP-7702 support |
| `@modelcontextprotocol/sdk` | Not used | v1.x | MCP server for agent tools |
| `zod` | Not used | v3.x | MCP tool input validation |

## Architecture Changes

```
v1 Architecture:
  OpenClaw SKILL.md (docs only)
    → PolicyAccount (ethers.js — broken EIP-7702)
      → WDK wallet
        → Sepolia (no test USDT)

v2 Architecture:
  OpenClaw SKILL.md + MCP Server (11 callable tools)
    → PolicyAccount (viem — working EIP-7702)
      → PolicyEngine (anomaly detection + risk scoring)
        → WDK wallet
          → Real Sepolia USDT (0x7169D388...)
          → PolicyDelegate v2 (execute/executeBatch)
          → Sepolia
  + ERC-8004 Identity Registry integration
  + Dashboard with working controls
```
