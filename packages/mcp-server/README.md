# @aspect-warden/mcp-server

MCP (Model Context Protocol) server that gives AI agents policy-enforced wallet capabilities on Sepolia. Works with Claude Desktop, OpenClaw, and any MCP-compatible client.

## Install

```bash
npm install @aspect-warden/mcp-server
```

Or run directly:

```bash
npx @aspect-warden/mcp-server
```

## Setup with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "warden": {
      "command": "npx",
      "args": ["@aspect-warden/mcp-server"],
      "env": {
        "RPC_URL": "https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY",
        "SEPOLIA_USDT_ADDRESS": "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06"
      }
    }
  }
}
```

Restart Claude Desktop. The agent now has access to all Warden wallet tools.

## Setup with OpenClaw

Add the same config to your OpenClaw MCP settings, or install the warden-wallet skill:

```bash
npx skills add tetherto/wdk-agent-skills
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RPC_URL` | No | `https://rpc.sepolia.org` | Sepolia RPC endpoint |
| `POLICY_DELEGATE_ADDRESS` | No | — | Deployed PolicyDelegate contract for EIP-7702 |
| `SEPOLIA_USDT_ADDRESS` | No | `0x7169...BA06` | USDT token address on Sepolia |
| `ERC8004_IDENTITY_REGISTRY` | No | — | ERC-8004 identity registry address |
| `WARDEN_STORAGE_KEY` | No | machine-scoped | Passphrase for encrypting persisted wallet state |

## MCP Tools

Once connected, the agent can call these tools:

### Wallet Management

| Tool | Description |
|------|-------------|
| `warden_create_wallet` | Create a new agent wallet with policy enforcement |
| `warden_get_balance` | Check ETH and token balances |
| `warden_transfer` | Send ERC-20 tokens (validated against policy) |
| `warden_get_audit_log` | Fetch transaction decision history |

### Policy Management

| Tool | Description |
|------|-------------|
| `warden_setup_policy` | Configure spending policy from natural language |
| `warden_get_policy_status` | View current spending status and limits |
| `warden_update_policy` | Modify policy at runtime |

### On-Chain Enforcement (EIP-7702)

| Tool | Description |
|------|-------------|
| `warden_delegate_to_policy` | Delegate EOA to PolicyDelegate contract |
| `warden_create_session_key` | Create scoped sub-agent permissions |
| `warden_revoke_session_key` | Revoke sub-agent access |

### Safety Controls

| Tool | Description |
|------|-------------|
| `warden_freeze` | Emergency halt all operations |
| `warden_unfreeze` | Resume after freeze |
| `warden_register_identity` | Register agent on ERC-8004 identity registry |

### Permissions (ERC-7715)

| Tool | Description |
|------|-------------|
| `warden_grant_permissions` | Grant permissions to an agent |
| `warden_revoke_permissions` | Revoke agent permissions |
| `warden_get_permissions` | View agent permission grants |

## Example Conversation

```
User: Create a conservative wallet. Max $50/day, USDT only.

Agent: [calls warden_create_wallet with maxPerTx=10, dailyLimit=50]
       Created wallet 0xABC...123 with conservative policy.
       - Max per transaction: 10 USDT
       - Daily limit: 50 USDT
       - Anomaly detection: enabled

User: Send 5 USDT to 0xDEF...456

Agent: [calls warden_transfer with amount=5, recipient=0xDEF...456]
       Transfer approved and sent.
       - Risk score: 12/100
       - Daily remaining: 45 USDT
       - Tx hash: 0x789...

User: Send 200 USDT to 0xDEF...456

Agent: [calls warden_transfer — PolicyEngine blocks it]
       Transfer blocked: exceeds daily limit of 50 USDT.
       Current daily spend: 5 USDT.
```

## Wallet Persistence

Wallet private keys and policy configuration are automatically saved to `~/.warden/wallet-state.enc` using AES-256-CBC encryption. When the MCP server restarts (e.g., Claude Desktop relaunch), it restores the previous wallet — no need to call `warden_create_wallet` again.

- **Storage**: `~/.warden/wallet-state.enc` (encrypted, file permissions `0600`)
- **Encryption**: AES-256-CBC with key derived from `WARDEN_STORAGE_KEY` env var (or machine-scoped default)
- **What's persisted**: private key, agent ID, policy configuration, spending tracker, audit log, frozen state, session keys, permission grants
- **Full state recovery**: everything survives restarts — works seamlessly with OpenClaw and other MCP clients that may restart the server between calls

To use a different wallet, simply call `warden_create_wallet` again — it overwrites the saved state.

## Architecture

```
AI Agent (Claude / OpenClaw)
    ↓ MCP Protocol (stdio)
@aspect-warden/mcp-server
    ↓ evaluates every tx
@aspect-warden/policy-engine (19 rules + anomaly detection)
    ↓ on-chain enforcement
PolicyDelegate.sol (EIP-7702 / Sepolia)
```

## License

MIT
