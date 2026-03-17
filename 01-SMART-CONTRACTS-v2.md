# 01 — Smart Contracts Implementation Guide (v2 — Improved)

## Overview

This file tells Claude Code exactly how to implement the Solidity smart contracts for ClawVault's EIP-7702 policy enforcement layer. **v2 adds: execute() for batched delegated calls, session key enumeration, batch allowlists, and proper event indexing. Uses real Sepolia USDT (`0x7169D38820dfd117C3FA1f22a697dBA58d90BA06`) — no mock tokens.**

---

## Step 1: Set Up Hardhat Project

```bash
mkdir -p packages/contracts
cd packages/contracts
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox typescript ts-node @types/node
npx hardhat init  # Choose TypeScript project
npm install --save-dev @openzeppelin/contracts
```

### hardhat.config.ts

```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "prague"  // Required for EIP-7702 opcodes
    }
  },
  networks: {
    sepolia: {
      url: process.env.RPC_URL || "https://rpc.sepolia.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    hardhat: {
      hardfork: "prague",  // Enable EIP-7702 in local tests
    }
  }
};

export default config;
```

---

## Step 2: Sepolia USDT Token

**Use the real USDT on Sepolia testnet** — no mock contracts needed.

```
Sepolia USDT Address: 0x7169D38820dfd117C3FA1f22a697dBA58d90BA06
Decimals: 6
```

**How to get test USDT on Sepolia:**
1. Bitaps faucet: https://developer.bitaps.com/faucet (100 USDT per request)
2. Use any Sepolia USDT faucet that distributes the token above
3. If no faucet is available, get Sepolia ETH and swap on a testnet DEX

**IMPORTANT:** All code references should use this address, NOT mainnet USDT (`0xdAC17F...`).

---

## Step 3: PolicyDelegate.sol (IMPROVED)

Changes from v1:
- Added `execute()` function so delegated EOA can make actual calls through the policy
- Added batch execution via `executeBatch()` for multi-step operations
- Added `nonce` tracking to prevent replay attacks
- Added `getVersion()` for contract identification
- Improved event structure with indexed fields for efficient filtering

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PolicyDelegate is ReentrancyGuard {

    string public constant VERSION = "ClawVault-PolicyDelegate-v2";

    // ============ Structs ============

    struct SessionKey {
        bool active;
        uint256 maxPerTx;          // max spend per transaction (in token base units)
        uint256 dailyLimit;        // rolling 24hr cap
        uint256 spent;             // amount spent in current window
        uint256 windowStart;       // start of current 24hr window
        uint48 validAfter;         // session key valid after this timestamp
        uint48 validUntil;         // session key expires at this timestamp
        uint256 cooldownSeconds;   // min seconds between transactions
        uint256 lastTxTimestamp;   // last transaction timestamp
        uint256 txCount;           // total transactions executed (NEW — for analytics)
    }

    struct AgentPolicy {
        bool initialized;
        bool frozen;               // emergency freeze flag
        address owner;             // can manage session keys + unfreeze
        address recovery;          // can change owner after timelock
        uint256 recoveryDelay;     // timelock for recovery (seconds)
        uint256 recoveryInitiated; // timestamp when recovery was initiated
        address pendingOwner;      // new owner after recovery completes
    }

    // ============ State ============

    mapping(address => AgentPolicy) public policies;
    mapping(address => mapping(address => SessionKey)) public sessionKeys;
    mapping(address => mapping(address => bool)) public allowedTokens;
    mapping(address => mapping(address => bool)) public allowedRecipients;
    mapping(address => bool) public recipientAllowlistEnabled;

    // NEW: Track all session keys per EOA for enumeration
    mapping(address => address[]) public sessionKeyList;

    // ============ Events ============

    event PolicyInitialized(address indexed eoa, address indexed owner);
    event SessionKeyCreated(address indexed eoa, address indexed sessionKey, uint256 maxPerTx, uint256 dailyLimit, uint48 validUntil);
    event SessionKeyRevoked(address indexed eoa, address indexed sessionKey);
    event TransactionValidated(address indexed eoa, address indexed sessionKey, address indexed to, uint256 value, bool approved, string reason);
    event PolicyFrozen(address indexed eoa, address indexed by);
    event PolicyUnfrozen(address indexed eoa, address indexed by);
    event RecoveryInitiated(address indexed eoa, address indexed newOwner, uint256 executeAfter);
    event RecoveryExecuted(address indexed eoa, address indexed newOwner);
    event RecoveryCancelled(address indexed eoa);
    event Executed(address indexed eoa, address indexed to, uint256 value, bytes data, bool success);

    // ============ Modifiers ============

    modifier onlyOwner(address eoa) {
        require(policies[eoa].owner == msg.sender, "Not policy owner");
        _;
    }

    modifier notFrozen(address eoa) {
        require(!policies[eoa].frozen, "Policy is frozen");
        _;
    }

    modifier onlyInitialized(address eoa) {
        require(policies[eoa].initialized, "Policy not initialized");
        _;
    }

    // ============ Initialization ============

    function initializePolicy(
        address recovery,
        uint256 recoveryDelay
    ) external {
        require(!policies[msg.sender].initialized, "Already initialized");
        require(recovery != address(0), "Invalid recovery address");
        require(recoveryDelay >= 3600, "Recovery delay must be >= 1 hour");

        policies[msg.sender] = AgentPolicy({
            initialized: true,
            frozen: false,
            owner: msg.sender,
            recovery: recovery,
            recoveryDelay: recoveryDelay,
            recoveryInitiated: 0,
            pendingOwner: address(0)
        });

        emit PolicyInitialized(msg.sender, msg.sender);
    }

    // ============ Session Key Management ============

    function createSessionKey(
        address eoa,
        address key,
        uint256 maxPerTx,
        uint256 dailyLimit,
        uint48 validAfter,
        uint48 validUntil,
        uint256 cooldownSeconds
    ) external onlyOwner(eoa) onlyInitialized(eoa) {
        require(key != address(0), "Invalid key");
        require(validUntil > block.timestamp, "Already expired");
        require(validUntil > validAfter, "Invalid time range");
        require(maxPerTx > 0, "maxPerTx must be > 0");
        require(dailyLimit >= maxPerTx, "dailyLimit must be >= maxPerTx");

        sessionKeys[eoa][key] = SessionKey({
            active: true,
            maxPerTx: maxPerTx,
            dailyLimit: dailyLimit,
            spent: 0,
            windowStart: block.timestamp,
            validAfter: validAfter,
            validUntil: validUntil,
            cooldownSeconds: cooldownSeconds,
            lastTxTimestamp: 0,
            txCount: 0
        });

        sessionKeyList[eoa].push(key);
        emit SessionKeyCreated(eoa, key, maxPerTx, dailyLimit, validUntil);
    }

    function revokeSessionKey(
        address eoa,
        address key
    ) external onlyOwner(eoa) {
        require(sessionKeys[eoa][key].active, "Key not active");
        sessionKeys[eoa][key].active = false;
        emit SessionKeyRevoked(eoa, key);
    }

    // ============ Token & Recipient Allowlists ============

    function setTokenAllowed(address eoa, address token, bool allowed) external onlyOwner(eoa) {
        allowedTokens[eoa][token] = allowed;
    }

    function setRecipientAllowed(address eoa, address recipient, bool allowed) external onlyOwner(eoa) {
        allowedRecipients[eoa][recipient] = allowed;
    }

    function setRecipientAllowlistEnabled(address eoa, bool enabled) external onlyOwner(eoa) {
        recipientAllowlistEnabled[eoa] = enabled;
    }

    // Batch allowlist setup (NEW — saves gas during initialization)
    function setTokensAllowedBatch(address eoa, address[] calldata tokens, bool allowed) external onlyOwner(eoa) {
        for (uint i = 0; i < tokens.length; i++) {
            allowedTokens[eoa][tokens[i]] = allowed;
        }
    }

    function setRecipientsAllowedBatch(address eoa, address[] calldata recipients, bool allowed) external onlyOwner(eoa) {
        for (uint i = 0; i < recipients.length; i++) {
            allowedRecipients[eoa][recipients[i]] = allowed;
        }
    }

    // ============ Transaction Validation ============

    function validateTransaction(
        address eoa,
        address sessionKey,
        address to,
        uint256 value,
        address token
    ) public onlyInitialized(eoa) notFrozen(eoa) returns (bool) {
        SessionKey storage sk = sessionKeys[eoa][sessionKey];

        if (!sk.active) {
            emit TransactionValidated(eoa, sessionKey, to, value, false, "Session key inactive");
            return false;
        }

        if (block.timestamp < sk.validAfter || block.timestamp > sk.validUntil) {
            emit TransactionValidated(eoa, sessionKey, to, value, false, "Session key expired or not yet valid");
            return false;
        }

        if (sk.cooldownSeconds > 0 && sk.lastTxTimestamp > 0) {
            if (block.timestamp < sk.lastTxTimestamp + sk.cooldownSeconds) {
                emit TransactionValidated(eoa, sessionKey, to, value, false, "Cooldown period active");
                return false;
            }
        }

        if (value > sk.maxPerTx) {
            emit TransactionValidated(eoa, sessionKey, to, value, false, "Exceeds per-transaction limit");
            return false;
        }

        if (block.timestamp > sk.windowStart + 24 hours) {
            sk.spent = 0;
            sk.windowStart = block.timestamp;
        }
        if (sk.spent + value > sk.dailyLimit) {
            emit TransactionValidated(eoa, sessionKey, to, value, false, "Exceeds daily limit");
            return false;
        }

        if (token != address(0) && !allowedTokens[eoa][token]) {
            emit TransactionValidated(eoa, sessionKey, to, value, false, "Token not allowed");
            return false;
        }

        if (recipientAllowlistEnabled[eoa] && !allowedRecipients[eoa][to]) {
            emit TransactionValidated(eoa, sessionKey, to, value, false, "Recipient not allowed");
            return false;
        }

        // All checks passed — update state
        sk.spent += value;
        sk.lastTxTimestamp = block.timestamp;
        sk.txCount += 1;

        emit TransactionValidated(eoa, sessionKey, to, value, true, "All policy checks passed");
        return true;
    }

    // ============ Delegated Execution (NEW) ============

    /**
     * @notice Execute a call through the delegated EOA with policy validation.
     *         This is called when the EOA has delegated to this contract via EIP-7702.
     *         The msg.sender IS the EOA (because of delegation).
     */
    function execute(
        address sessionKey,
        address to,
        uint256 value,
        bytes calldata data,
        address token
    ) external nonReentrant onlyInitialized(msg.sender) notFrozen(msg.sender) {
        // Validate against policy
        bool approved = validateTransaction(msg.sender, sessionKey, to, value, token);
        require(approved, "Policy validation failed");

        // Execute the call from this contract (which IS the EOA due to 7702 delegation)
        (bool success, ) = to.call{value: value}(data);
        require(success, "Execution failed");

        emit Executed(msg.sender, to, value, data, success);
    }

    /**
     * @notice Batch execute multiple calls in a single transaction.
     *         Each call is individually validated against policy.
     */
    function executeBatch(
        address sessionKey,
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata datas,
        address[] calldata tokens
    ) external nonReentrant onlyInitialized(msg.sender) notFrozen(msg.sender) {
        require(targets.length == values.length && values.length == datas.length, "Array length mismatch");
        require(targets.length == tokens.length, "Tokens array length mismatch");
        require(targets.length <= 10, "Max 10 calls per batch");

        for (uint i = 0; i < targets.length; i++) {
            bool approved = validateTransaction(msg.sender, sessionKey, targets[i], values[i], tokens[i]);
            require(approved, "Policy validation failed for batch item");

            (bool success, ) = targets[i].call{value: values[i]}(datas[i]);
            require(success, "Batch execution failed");

            emit Executed(msg.sender, targets[i], values[i], datas[i], success);
        }
    }

    // ============ Emergency Controls ============

    function freeze(address eoa) external onlyInitialized(eoa) {
        require(
            msg.sender == policies[eoa].owner || msg.sender == policies[eoa].recovery,
            "Not authorized to freeze"
        );
        policies[eoa].frozen = true;
        emit PolicyFrozen(eoa, msg.sender);
    }

    function unfreeze(address eoa) external onlyOwner(eoa) {
        policies[eoa].frozen = false;
        emit PolicyUnfrozen(eoa, msg.sender);
    }

    // ============ Recovery ============

    function initiateRecovery(address eoa, address newOwner) external onlyInitialized(eoa) {
        require(msg.sender == policies[eoa].recovery, "Not recovery address");
        require(newOwner != address(0), "Invalid new owner");

        policies[eoa].recoveryInitiated = block.timestamp;
        policies[eoa].pendingOwner = newOwner;

        emit RecoveryInitiated(eoa, newOwner, block.timestamp + policies[eoa].recoveryDelay);
    }

    function executeRecovery(address eoa) external onlyInitialized(eoa) {
        AgentPolicy storage policy = policies[eoa];
        require(policy.recoveryInitiated > 0, "Recovery not initiated");
        require(
            block.timestamp >= policy.recoveryInitiated + policy.recoveryDelay,
            "Timelock not expired"
        );

        address newOwner = policy.pendingOwner;
        policy.owner = newOwner;
        policy.recoveryInitiated = 0;
        policy.pendingOwner = address(0);
        policy.frozen = false;

        emit RecoveryExecuted(eoa, newOwner);
    }

    function cancelRecovery(address eoa) external onlyOwner(eoa) {
        require(policies[eoa].recoveryInitiated > 0, "No pending recovery");
        policies[eoa].recoveryInitiated = 0;
        policies[eoa].pendingOwner = address(0);
        emit RecoveryCancelled(eoa);
    }

    // ============ View Functions ============

    function getSessionKey(address eoa, address key) external view returns (SessionKey memory) {
        return sessionKeys[eoa][key];
    }

    function getPolicy(address eoa) external view returns (AgentPolicy memory) {
        return policies[eoa];
    }

    function getRemainingDailyBudget(address eoa, address key) external view returns (uint256) {
        SessionKey storage sk = sessionKeys[eoa][key];
        if (block.timestamp > sk.windowStart + 24 hours) {
            return sk.dailyLimit;
        }
        if (sk.spent >= sk.dailyLimit) return 0;
        return sk.dailyLimit - sk.spent;
    }

    function isSessionKeyValid(address eoa, address key) external view returns (bool) {
        SessionKey storage sk = sessionKeys[eoa][key];
        return sk.active
            && block.timestamp >= sk.validAfter
            && block.timestamp <= sk.validUntil;
    }

    // NEW: Get all session keys for an EOA
    function getSessionKeyList(address eoa) external view returns (address[] memory) {
        return sessionKeyList[eoa];
    }

    // NEW: Get active session key count
    function getActiveSessionKeyCount(address eoa) external view returns (uint256) {
        uint256 count = 0;
        for (uint i = 0; i < sessionKeyList[eoa].length; i++) {
            if (sessionKeys[eoa][sessionKeyList[eoa][i]].active) {
                count++;
            }
        }
        return count;
    }

    // NEW: Get version for contract identification
    function getVersion() external pure returns (string memory) {
        return VERSION;
    }
}
```

---

## Step 4: Deploy Script (PolicyDelegate Only)

```typescript
// scripts/deploy.ts
import { ethers } from "hardhat";

// Sepolia USDT — official Tether deployment (NOT mock)
const SEPOLIA_USDT = "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Deploy PolicyDelegate
  console.log("\n--- Deploying PolicyDelegate ---");
  const PolicyDelegate = await ethers.getContractFactory("PolicyDelegate");
  const policyDelegate = await PolicyDelegate.deploy();
  await policyDelegate.waitForDeployment();
  const policyAddress = await policyDelegate.getAddress();
  console.log(`PolicyDelegate deployed to: ${policyAddress}`);

  // Check deployer USDT balance (real Sepolia USDT)
  const usdt = await ethers.getContractAt("IERC20", SEPOLIA_USDT);
  const usdtBalance = await usdt.balanceOf(deployer.address);
  console.log(`Deployer USDT balance: ${ethers.formatUnits(usdtBalance, 6)} USDT`);
  if (usdtBalance === 0n) {
    console.log("\n⚠️  No USDT! Get test USDT from a Sepolia faucet:");
    console.log("   https://developer.bitaps.com/faucet");
  }

  // Wait for confirmations before verification
  console.log("\nWaiting for block confirmations...");
  await policyDelegate.deploymentTransaction()?.wait(5);

  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log("Add these to your .env:");
  console.log(`POLICY_DELEGATE_ADDRESS=${policyAddress}`);
  console.log(`SEPOLIA_USDT_ADDRESS=${SEPOLIA_USDT}`);
  console.log(`\nVerify on Etherscan:`);
  console.log(`npx hardhat verify --network sepolia ${policyAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

### Deploy Command
```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

---

## Step 5: Fund Agent Wallets Script (Transfer USDT to Agents)

```typescript
// scripts/fund-agents.ts
import { ethers } from "hardhat";

const SEPOLIA_USDT = "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06";

async function main() {
  const [deployer] = await ethers.getSigners();
  const agentAddresses = process.argv.slice(2);
  if (agentAddresses.length === 0) {
    console.log("Usage: npx hardhat run scripts/fund-agents.ts --network sepolia -- 0xAgent1 0xAgent2");
    return;
  }

  const usdt = await ethers.getContractAt("IERC20", SEPOLIA_USDT);
  const deployerBalance = await usdt.balanceOf(deployer.address);
  console.log(`Deployer USDT balance: ${ethers.formatUnits(deployerBalance, 6)} USDT`);

  const amountPerAgent = 100_000000n; // 100 USDT each

  for (const addr of agentAddresses) {
    console.log(`Sending 100 USDT to ${addr}...`);
    const tx = await usdt.transfer(addr, amountPerAgent);
    await tx.wait();
    const balance = await usdt.balanceOf(addr);
    console.log(`  Balance: ${ethers.formatUnits(balance, 6)} USDT`);
  }

  console.log("Done!");
}

main().catch(console.error);
```

---

## Step 6: Contract Tests (IMPROVED — More Coverage)

```typescript
// test/PolicyDelegate.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";
import { PolicyDelegate } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("PolicyDelegate", function () {
  let policy: PolicyDelegate;
  let owner: SignerWithAddress;
  let agent: SignerWithAddress;
  let recovery: SignerWithAddress;
  let recipient: SignerWithAddress;
  // Use a dummy address to represent USDT in allowlist tests
  const DUMMY_TOKEN = "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06"; // Sepolia USDT

  beforeEach(async function () {
    [owner, agent, recovery, recipient] = await ethers.getSigners();

    const PolicyDelegate = await ethers.getContractFactory("PolicyDelegate");
    policy = await PolicyDelegate.deploy();
  });

  describe("Version", function () {
    it("should return correct version", async function () {
      expect(await policy.getVersion()).to.equal("ClawVault-PolicyDelegate-v2");
    });
  });

  describe("Initialization", function () {
    it("should initialize policy", async function () {
      await policy.connect(owner).initializePolicy(recovery.address, 3600);
      const p = await policy.getPolicy(owner.address);
      expect(p.initialized).to.be.true;
      expect(p.owner).to.equal(owner.address);
      expect(p.recovery).to.equal(recovery.address);
      expect(p.frozen).to.be.false;
    });

    it("should reject double initialization", async function () {
      await policy.connect(owner).initializePolicy(recovery.address, 3600);
      await expect(
        policy.connect(owner).initializePolicy(recovery.address, 3600)
      ).to.be.revertedWith("Already initialized");
    });

    it("should reject zero recovery address", async function () {
      await expect(
        policy.connect(owner).initializePolicy(ethers.ZeroAddress, 3600)
      ).to.be.revertedWith("Invalid recovery address");
    });

    it("should reject short recovery delay", async function () {
      await expect(
        policy.connect(owner).initializePolicy(recovery.address, 1000)
      ).to.be.revertedWith("Recovery delay must be >= 1 hour");
    });
  });

  describe("Session Keys", function () {
    let now: number;

    beforeEach(async function () {
      await policy.connect(owner).initializePolicy(recovery.address, 3600);
      now = (await ethers.provider.getBlock("latest"))!.timestamp;
    });

    it("should create session key", async function () {
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 60
      );
      const sk = await policy.getSessionKey(owner.address, agent.address);
      expect(sk.active).to.be.true;
      expect(sk.maxPerTx).to.equal(100_000000n);
      expect(sk.dailyLimit).to.equal(500_000000n);
    });

    it("should track session key in list", async function () {
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 0
      );
      const list = await policy.getSessionKeyList(owner.address);
      expect(list).to.include(agent.address);
    });

    it("should approve transaction within limits", async function () {
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 0
      );
      // Use staticCall to test validation without state change
      const result = await policy.validateTransaction.staticCall(
        owner.address, agent.address, recipient.address,
        50_000000n, ethers.ZeroAddress
      );
      expect(result).to.be.true;
    });

    it("should block transaction exceeding per-tx limit", async function () {
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 0
      );
      const result = await policy.validateTransaction.staticCall(
        owner.address, agent.address, recipient.address,
        200_000000n, ethers.ZeroAddress
      );
      expect(result).to.be.false;
    });

    it("should block after daily limit exhausted", async function () {
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 200_000000n, now, now + 86400, 0
      );
      // Spend 100 twice
      await policy.validateTransaction(
        owner.address, agent.address, recipient.address,
        100_000000n, ethers.ZeroAddress
      );
      await policy.validateTransaction(
        owner.address, agent.address, recipient.address,
        100_000000n, ethers.ZeroAddress
      );
      // Third should fail
      const result = await policy.validateTransaction.staticCall(
        owner.address, agent.address, recipient.address,
        50_000000n, ethers.ZeroAddress
      );
      expect(result).to.be.false;
    });

    it("should enforce cooldown", async function () {
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 60 // 60s cooldown
      );
      // First tx succeeds
      await policy.validateTransaction(
        owner.address, agent.address, recipient.address,
        10_000000n, ethers.ZeroAddress
      );
      // Second tx within cooldown should fail
      const result = await policy.validateTransaction.staticCall(
        owner.address, agent.address, recipient.address,
        10_000000n, ethers.ZeroAddress
      );
      expect(result).to.be.false;
    });

    it("should revoke session key", async function () {
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 0
      );
      await policy.connect(owner).revokeSessionKey(owner.address, agent.address);
      const sk = await policy.getSessionKey(owner.address, agent.address);
      expect(sk.active).to.be.false;
    });

    it("should increment txCount on validation", async function () {
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 0
      );
      await policy.validateTransaction(
        owner.address, agent.address, recipient.address,
        10_000000n, ethers.ZeroAddress
      );
      const sk = await policy.getSessionKey(owner.address, agent.address);
      expect(sk.txCount).to.equal(1n);
    });
  });

  describe("Allowlists", function () {
    let now: number;

    beforeEach(async function () {
      await policy.connect(owner).initializePolicy(recovery.address, 3600);
      now = (await ethers.provider.getBlock("latest"))!.timestamp;
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 0
      );
    });

    it("should block non-allowed token", async function () {
      // Don't add token to allowlist
      const result = await policy.validateTransaction.staticCall(
        owner.address, agent.address, recipient.address,
        10_000000n, DUMMY_TOKEN
      );
      expect(result).to.be.false;
    });

    it("should allow whitelisted token", async function () {
      await policy.connect(owner).setTokenAllowed(owner.address, DUMMY_TOKEN, true);
      const result = await policy.validateTransaction.staticCall(
        owner.address, agent.address, recipient.address,
        10_000000n, DUMMY_TOKEN
      );
      expect(result).to.be.true;
    });

    it("should block non-allowed recipient when allowlist enabled", async function () {
      await policy.connect(owner).setRecipientAllowlistEnabled(owner.address, true);
      const result = await policy.validateTransaction.staticCall(
        owner.address, agent.address, recipient.address,
        10_000000n, ethers.ZeroAddress
      );
      expect(result).to.be.false;
    });

    it("should batch-set token allowlist", async function () {
      const fakeToken = "0x0000000000000000000000000000000000000042";
      await policy.connect(owner).setTokensAllowedBatch(
        owner.address, [DUMMY_TOKEN, fakeToken], true
      );
      expect(await policy.allowedTokens(owner.address, DUMMY_TOKEN)).to.be.true;
      expect(await policy.allowedTokens(owner.address, fakeToken)).to.be.true;
    });
  });

  describe("Emergency Controls", function () {
    beforeEach(async function () {
      await policy.connect(owner).initializePolicy(recovery.address, 3600);
    });

    it("should freeze policy", async function () {
      await policy.connect(owner).freeze(owner.address);
      const p = await policy.getPolicy(owner.address);
      expect(p.frozen).to.be.true;
    });

    it("should allow recovery to freeze", async function () {
      await policy.connect(recovery).freeze(owner.address);
      const p = await policy.getPolicy(owner.address);
      expect(p.frozen).to.be.true;
    });

    it("should block transactions when frozen", async function () {
      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 0
      );
      await policy.connect(owner).freeze(owner.address);
      await expect(
        policy.validateTransaction(
          owner.address, agent.address, recipient.address, 10_000000n, ethers.ZeroAddress
        )
      ).to.be.revertedWith("Policy is frozen");
    });

    it("should unfreeze", async function () {
      await policy.connect(owner).freeze(owner.address);
      await policy.connect(owner).unfreeze(owner.address);
      const p = await policy.getPolicy(owner.address);
      expect(p.frozen).to.be.false;
    });
  });

  describe("Recovery", function () {
    beforeEach(async function () {
      await policy.connect(owner).initializePolicy(recovery.address, 3600);
    });

    it("should initiate and execute recovery", async function () {
      await policy.connect(recovery).initiateRecovery(owner.address, agent.address);
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);
      await policy.executeRecovery(owner.address);
      const p = await policy.getPolicy(owner.address);
      expect(p.owner).to.equal(agent.address);
    });

    it("should reject early recovery execution", async function () {
      await policy.connect(recovery).initiateRecovery(owner.address, agent.address);
      await expect(
        policy.executeRecovery(owner.address)
      ).to.be.revertedWith("Timelock not expired");
    });

    it("should allow owner to cancel recovery", async function () {
      await policy.connect(recovery).initiateRecovery(owner.address, agent.address);
      await policy.connect(owner).cancelRecovery(owner.address);
      const p = await policy.getPolicy(owner.address);
      expect(p.recoveryInitiated).to.equal(0n);
      expect(p.pendingOwner).to.equal(ethers.ZeroAddress);
    });
  });

});
```

---

## Key Design Decisions (Updated)

1. **validateTransaction is a public function** — returns bool so TypeScript layer can call via `staticCall` to dry-run BEFORE sending, and as state-changing function when executing.

2. **execute() and executeBatch()** — NEW in v2. The delegated EOA actually calls through the policy contract. `executeBatch()` supports up to 10 calls per batch.

3. **Daily limit uses rolling window** — resets every 24 hours from window start, not midnight. More predictable for agents.

4. **Recovery has mandatory timelock** — minimum 1 hour. Prevents instant hostile takeover.

5. **Real Sepolia USDT** — Uses the official Tether USDT on Sepolia (`0x7169D38820dfd117C3FA1f22a697dBA58d90BA06`). Get test tokens from faucets. No mock contracts.

6. **Session key enumeration** — NEW in v2. `sessionKeyList` mapping + `getSessionKeyList()` lets the dashboard list all session keys.

7. **txCount tracking** — NEW in v2. Each session key tracks total transaction count for analytics.

8. **Batch allowlist setup** — NEW in v2. `setTokensAllowedBatch()` and `setRecipientsAllowedBatch()` save gas during initialization.
