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
  let other: SignerWithAddress;
  const DUMMY_TOKEN = "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06";

  beforeEach(async function () {
    [owner, agent, recovery, recipient, other] = await ethers.getSigners();

    const PolicyDelegate = await ethers.getContractFactory("PolicyDelegate");
    policy = await PolicyDelegate.deploy();
  });

  describe("Version", function () {
    it("should return correct version", async function () {
      expect(await policy.getVersion()).to.equal("Warden-PolicyDelegate-v3");
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
      expect(p.minReputation).to.equal(0n);
    });

    it("should emit PolicyInitialized event", async function () {
      await expect(policy.connect(owner).initializePolicy(recovery.address, 3600))
        .to.emit(policy, "PolicyInitialized")
        .withArgs(owner.address, owner.address);
    });

    it("should reject double initialization", async function () {
      await policy.connect(owner).initializePolicy(recovery.address, 3600);
      await expect(
        policy.connect(owner).initializePolicy(recovery.address, 3600)
      ).to.be.revertedWithCustomError(policy, "AlreadyInitialized");
    });

    it("should reject zero recovery address", async function () {
      await expect(
        policy.connect(owner).initializePolicy(ethers.ZeroAddress, 3600)
      ).to.be.revertedWithCustomError(policy, "InvalidRecoveryAddress");
    });

    it("should reject short recovery delay", async function () {
      await expect(
        policy.connect(owner).initializePolicy(recovery.address, 1000)
      ).to.be.revertedWithCustomError(policy, "RecoveryDelayTooShort")
        .withArgs(1000, 3600);
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
      expect(sk.restrictFunctions).to.be.false;
    });

    it("should emit SessionKeyCreated with all params", async function () {
      await expect(
        policy.connect(owner).createSessionKey(
          owner.address, agent.address,
          100_000000n, 500_000000n, now, now + 86400, 60
        )
      ).to.emit(policy, "SessionKeyCreated")
        .withArgs(owner.address, agent.address, 100_000000n, 500_000000n, now, now + 86400, 60);
    });

    it("should reject creating session key with active key at same address", async function () {
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 0
      );
      await expect(
        policy.connect(owner).createSessionKey(
          owner.address, agent.address,
          50_000000n, 200_000000n, now, now + 86400, 0
        )
      ).to.be.revertedWithCustomError(policy, "SessionKeyAlreadyActive");
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
      const result = await policy.validateTransaction.staticCall(
        owner.address, agent.address, recipient.address, 50_000000n, ethers.ZeroAddress
      );
      expect(result).to.be.true;
    });

    it("should block transaction exceeding per-tx limit", async function () {
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 0
      );
      const result = await policy.validateTransaction.staticCall(
        owner.address, agent.address, recipient.address, 200_000000n, ethers.ZeroAddress
      );
      expect(result).to.be.false;
    });

    it("should block after daily limit exhausted", async function () {
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 200_000000n, now, now + 86400, 0
      );
      await policy.validateTransaction(
        owner.address, agent.address, recipient.address, 100_000000n, ethers.ZeroAddress
      );
      await policy.validateTransaction(
        owner.address, agent.address, recipient.address, 100_000000n, ethers.ZeroAddress
      );
      const result = await policy.validateTransaction.staticCall(
        owner.address, agent.address, recipient.address, 50_000000n, ethers.ZeroAddress
      );
      expect(result).to.be.false;
    });

    it("should reset daily window after 24 hours", async function () {
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 200_000000n, now, now + 172800, 0
      );
      // Exhaust daily limit
      await policy.validateTransaction(
        owner.address, agent.address, recipient.address, 100_000000n, ethers.ZeroAddress
      );
      await policy.validateTransaction(
        owner.address, agent.address, recipient.address, 100_000000n, ethers.ZeroAddress
      );
      // Fast forward 24h+1s
      await ethers.provider.send("evm_increaseTime", [86401]);
      await ethers.provider.send("evm_mine", []);
      // Should now allow transactions again
      const result = await policy.validateTransaction.staticCall(
        owner.address, agent.address, recipient.address, 50_000000n, ethers.ZeroAddress
      );
      expect(result).to.be.true;
    });

    it("should enforce cooldown", async function () {
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 60
      );
      await policy.validateTransaction(
        owner.address, agent.address, recipient.address, 10_000000n, ethers.ZeroAddress
      );
      const result = await policy.validateTransaction.staticCall(
        owner.address, agent.address, recipient.address, 10_000000n, ethers.ZeroAddress
      );
      expect(result).to.be.false;
    });

    it("should allow after cooldown expires", async function () {
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 60
      );
      await policy.validateTransaction(
        owner.address, agent.address, recipient.address, 10_000000n, ethers.ZeroAddress
      );
      await ethers.provider.send("evm_increaseTime", [61]);
      await ethers.provider.send("evm_mine", []);
      const result = await policy.validateTransaction.staticCall(
        owner.address, agent.address, recipient.address, 10_000000n, ethers.ZeroAddress
      );
      expect(result).to.be.true;
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

    it("should reject revoking inactive session key", async function () {
      await expect(
        policy.connect(owner).revokeSessionKey(owner.address, agent.address)
      ).to.be.revertedWithCustomError(policy, "SessionKeyInactive");
    });

    it("should increment txCount on validation", async function () {
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 0
      );
      await policy.validateTransaction(
        owner.address, agent.address, recipient.address, 10_000000n, ethers.ZeroAddress
      );
      const sk = await policy.getSessionKey(owner.address, agent.address);
      expect(sk.txCount).to.equal(1n);
    });

    it("should return active session key count", async function () {
      expect(await policy.getActiveSessionKeyCount(owner.address)).to.equal(0);
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 0
      );
      expect(await policy.getActiveSessionKeyCount(owner.address)).to.equal(1);
      await policy.connect(owner).revokeSessionKey(owner.address, agent.address);
      expect(await policy.getActiveSessionKeyCount(owner.address)).to.equal(0);
    });

    it("should allow zero-value transactions", async function () {
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 0
      );
      const result = await policy.validateTransaction.staticCall(
        owner.address, agent.address, recipient.address, 0n, ethers.ZeroAddress
      );
      expect(result).to.be.true;
    });

    it("should reject non-owner creating session key", async function () {
      await expect(
        policy.connect(agent).createSessionKey(
          owner.address, agent.address,
          100_000000n, 500_000000n, now, now + 86400, 0
        )
      ).to.be.revertedWithCustomError(policy, "NotPolicyOwner");
    });

    it("should reject zero-address session key", async function () {
      await expect(
        policy.connect(owner).createSessionKey(
          owner.address, ethers.ZeroAddress,
          100_000000n, 500_000000n, now, now + 86400, 0
        )
      ).to.be.revertedWithCustomError(policy, "InvalidSessionKey");
    });

    it("should reject already-expired session key", async function () {
      await expect(
        policy.connect(owner).createSessionKey(
          owner.address, agent.address,
          100_000000n, 500_000000n, now - 200, now - 100, 0
        )
      ).to.be.revertedWithCustomError(policy, "SessionKeyExpired");
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
      const result = await policy.validateTransaction.staticCall(
        owner.address, agent.address, recipient.address, 10_000000n, DUMMY_TOKEN
      );
      expect(result).to.be.false;
    });

    it("should allow whitelisted token", async function () {
      await policy.connect(owner).setTokenAllowed(owner.address, DUMMY_TOKEN, true);
      const result = await policy.validateTransaction.staticCall(
        owner.address, agent.address, recipient.address, 10_000000n, DUMMY_TOKEN
      );
      expect(result).to.be.true;
    });

    it("should emit TokenAllowlistUpdated event", async function () {
      await expect(
        policy.connect(owner).setTokenAllowed(owner.address, DUMMY_TOKEN, true)
      ).to.emit(policy, "TokenAllowlistUpdated")
        .withArgs(owner.address, DUMMY_TOKEN, true);
    });

    it("should block non-allowed recipient when allowlist enabled", async function () {
      await policy.connect(owner).setRecipientAllowlistEnabled(owner.address, true);
      const result = await policy.validateTransaction.staticCall(
        owner.address, agent.address, recipient.address, 10_000000n, ethers.ZeroAddress
      );
      expect(result).to.be.false;
    });

    it("should emit RecipientAllowlistToggled event", async function () {
      await expect(
        policy.connect(owner).setRecipientAllowlistEnabled(owner.address, true)
      ).to.emit(policy, "RecipientAllowlistToggled")
        .withArgs(owner.address, true);
    });

    it("should emit RecipientAllowlistUpdated event", async function () {
      await expect(
        policy.connect(owner).setRecipientAllowed(owner.address, recipient.address, true)
      ).to.emit(policy, "RecipientAllowlistUpdated")
        .withArgs(owner.address, recipient.address, true);
    });

    it("should batch-set token allowlist", async function () {
      const fakeToken = "0x0000000000000000000000000000000000000042";
      await policy.connect(owner).setTokensAllowedBatch(
        owner.address, [DUMMY_TOKEN, fakeToken], true
      );
      expect(await policy.allowedTokens(owner.address, DUMMY_TOKEN)).to.be.true;
      expect(await policy.allowedTokens(owner.address, fakeToken)).to.be.true;
    });

    it("should batch-set recipient allowlist", async function () {
      await policy.connect(owner).setRecipientAllowlistEnabled(owner.address, true);
      await policy.connect(owner).setRecipientsAllowedBatch(
        owner.address, [recipient.address, agent.address], true
      );
      expect(await policy.allowedRecipients(owner.address, recipient.address)).to.be.true;
      expect(await policy.allowedRecipients(owner.address, agent.address)).to.be.true;
    });
  });

  describe("Function Selector Permissions", function () {
    let now: number;
    const TRANSFER_SELECTOR = "0xa9059cbb"; // transfer(address,uint256)

    beforeEach(async function () {
      await policy.connect(owner).initializePolicy(recovery.address, 3600);
      now = (await ethers.provider.getBlock("latest"))!.timestamp;
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 0
      );
    });

    it("should enable restrictFunctions when setting selector", async function () {
      await policy.connect(owner).setAllowedSelector(
        owner.address, agent.address, DUMMY_TOKEN, TRANSFER_SELECTOR, true
      );
      const sk = await policy.getSessionKey(owner.address, agent.address);
      expect(sk.restrictFunctions).to.be.true;
    });

    it("should emit SessionKeyPermissionUpdated event", async function () {
      await expect(
        policy.connect(owner).setAllowedSelector(
          owner.address, agent.address, DUMMY_TOKEN, TRANSFER_SELECTOR, true
        )
      ).to.emit(policy, "SessionKeyPermissionUpdated")
        .withArgs(owner.address, agent.address, DUMMY_TOKEN, TRANSFER_SELECTOR, true);
    });

    it("should block non-allowed function selector via validateTransactionFull", async function () {
      await policy.connect(owner).setAllowedSelector(
        owner.address, agent.address, recipient.address, TRANSFER_SELECTOR, true
      );
      const APPROVE_SELECTOR = "0x095ea7b3"; // approve(address,uint256)
      const approveData = APPROVE_SELECTOR + "0".repeat(120);
      const result = await policy.validateTransactionFull.staticCall(
        owner.address, agent.address, recipient.address, 0n, ethers.ZeroAddress, approveData
      );
      expect(result).to.be.false;
    });

    it("should allow permitted function selector", async function () {
      await policy.connect(owner).setAllowedSelector(
        owner.address, agent.address, recipient.address, TRANSFER_SELECTOR, true
      );
      const transferData = TRANSFER_SELECTOR + "0".repeat(120);
      const result = await policy.validateTransactionFull.staticCall(
        owner.address, agent.address, recipient.address, 0n, ethers.ZeroAddress, transferData
      );
      expect(result).to.be.true;
    });

    it("should batch-set selectors", async function () {
      const APPROVE_SELECTOR = "0x095ea7b3";
      await policy.connect(owner).setAllowedSelectorsBatch(
        owner.address, agent.address, DUMMY_TOKEN,
        [TRANSFER_SELECTOR, APPROVE_SELECTOR], true
      );
      expect(await policy.allowedSelectors(owner.address, agent.address, DUMMY_TOKEN, TRANSFER_SELECTOR)).to.be.true;
      expect(await policy.allowedSelectors(owner.address, agent.address, DUMMY_TOKEN, APPROVE_SELECTOR)).to.be.true;
    });
  });

  describe("Nonce-Based Replay Protection", function () {
    let now: number;

    beforeEach(async function () {
      await policy.connect(owner).initializePolicy(recovery.address, 3600);
      now = (await ethers.provider.getBlock("latest"))!.timestamp;
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 0
      );
    });

    it("should start nonce at 0", async function () {
      expect(await policy.getSessionNonce(owner.address, agent.address)).to.equal(0n);
    });

    it("should execute with correct nonce", async function () {
      await expect(
        policy.connect(owner).execute(
          agent.address, recipient.address, 0, "0x", ethers.ZeroAddress, 0
        )
      ).to.not.be.reverted;
      expect(await policy.getSessionNonce(owner.address, agent.address)).to.equal(1n);
    });

    it("should reject wrong nonce", async function () {
      await expect(
        policy.connect(owner).execute(
          agent.address, recipient.address, 0, "0x", ethers.ZeroAddress, 5
        )
      ).to.be.revertedWithCustomError(policy, "InvalidNonce")
        .withArgs(5, 0);
    });

    it("should increment nonce on batch execute", async function () {
      await policy.connect(owner).executeBatch(
        agent.address,
        [recipient.address], [0], ["0x"], [ethers.ZeroAddress], 0
      );
      expect(await policy.getSessionNonce(owner.address, agent.address)).to.equal(1n);
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

    it("should emit PolicyFrozen event", async function () {
      await expect(policy.connect(owner).freeze(owner.address))
        .to.emit(policy, "PolicyFrozen")
        .withArgs(owner.address, owner.address);
    });

    it("should allow recovery to freeze", async function () {
      await policy.connect(recovery).freeze(owner.address);
      const p = await policy.getPolicy(owner.address);
      expect(p.frozen).to.be.true;
    });

    it("should reject unauthorized freeze", async function () {
      await expect(
        policy.connect(other).freeze(owner.address)
      ).to.be.revertedWithCustomError(policy, "NotAuthorizedToFreeze");
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
      ).to.be.revertedWithCustomError(policy, "PolicyIsFrozen");
    });

    it("should unfreeze", async function () {
      await policy.connect(owner).freeze(owner.address);
      await policy.connect(owner).unfreeze(owner.address);
      const p = await policy.getPolicy(owner.address);
      expect(p.frozen).to.be.false;
    });

    it("should emit PolicyUnfrozen event", async function () {
      await policy.connect(owner).freeze(owner.address);
      await expect(policy.connect(owner).unfreeze(owner.address))
        .to.emit(policy, "PolicyUnfrozen")
        .withArgs(owner.address, owner.address);
    });
  });

  describe("Execution", function () {
    let now: number;

    beforeEach(async function () {
      await policy.connect(owner).initializePolicy(recovery.address, 3600);
      now = (await ethers.provider.getBlock("latest"))!.timestamp;
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 0
      );
    });

    it("should execute via policy", async function () {
      await expect(
        policy.connect(owner).execute(
          agent.address, recipient.address, 0, "0x", ethers.ZeroAddress, 0
        )
      ).to.emit(policy, "Executed")
        .withArgs(owner.address, recipient.address, 0, "0x", true);
    });

    it("should execute batch via policy", async function () {
      await expect(
        policy.connect(owner).executeBatch(
          agent.address,
          [recipient.address, recovery.address],
          [0, 0],
          ["0x", "0x"],
          [ethers.ZeroAddress, ethers.ZeroAddress],
          0
        )
      ).to.not.be.reverted;
    });

    it("should reject batch exceeding 10 calls", async function () {
      const targets = Array(11).fill(recipient.address);
      const values = Array(11).fill(0);
      const datas = Array(11).fill("0x");
      const tokens = Array(11).fill(ethers.ZeroAddress);

      await expect(
        policy.connect(owner).executeBatch(
          agent.address, targets, values, datas, tokens, 0
        )
      ).to.be.revertedWithCustomError(policy, "BatchTooLarge")
        .withArgs(11, 10);
    });

    it("should reject batch with mismatched arrays", async function () {
      await expect(
        policy.connect(owner).executeBatch(
          agent.address,
          [recipient.address, recovery.address],
          [0],
          ["0x", "0x"],
          [ethers.ZeroAddress, ethers.ZeroAddress],
          0
        )
      ).to.be.revertedWithCustomError(policy, "ArrayLengthMismatch");
    });

    it("should reject execution on uninitialized policy", async function () {
      await expect(
        policy.connect(other).execute(
          agent.address, recipient.address, 0, "0x", ethers.ZeroAddress, 0
        )
      ).to.be.revertedWithCustomError(policy, "PolicyNotInitialized");
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

    it("should emit RecoveryInitiated event", async function () {
      const tx = policy.connect(recovery).initiateRecovery(owner.address, agent.address);
      await expect(tx).to.emit(policy, "RecoveryInitiated");
    });

    it("should reject early recovery execution", async function () {
      await policy.connect(recovery).initiateRecovery(owner.address, agent.address);
      await expect(
        policy.executeRecovery(owner.address)
      ).to.be.revertedWithCustomError(policy, "TimelockNotExpired");
    });

    it("should reject non-recovery address initiating", async function () {
      await expect(
        policy.connect(other).initiateRecovery(owner.address, agent.address)
      ).to.be.revertedWithCustomError(policy, "NotRecoveryAddress");
    });

    it("should reject recovery with zero address", async function () {
      await expect(
        policy.connect(recovery).initiateRecovery(owner.address, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(policy, "InvalidNewOwner");
    });

    it("should allow owner to cancel recovery", async function () {
      await policy.connect(recovery).initiateRecovery(owner.address, agent.address);
      await policy.connect(owner).cancelRecovery(owner.address);
      const p = await policy.getPolicy(owner.address);
      expect(p.recoveryInitiated).to.equal(0n);
      expect(p.pendingOwner).to.equal(ethers.ZeroAddress);
    });

    it("should reject cancel when no recovery pending", async function () {
      await expect(
        policy.connect(owner).cancelRecovery(owner.address)
      ).to.be.revertedWithCustomError(policy, "NoRecoveryPending");
    });

    it("should reject recovery execution when not initiated", async function () {
      await expect(
        policy.executeRecovery(owner.address)
      ).to.be.revertedWithCustomError(policy, "RecoveryNotInitiated");
    });

    it("should unfreeze policy on recovery execution", async function () {
      await policy.connect(owner).freeze(owner.address);
      await policy.connect(recovery).initiateRecovery(owner.address, agent.address);
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);
      await policy.executeRecovery(owner.address);
      const p = await policy.getPolicy(owner.address);
      expect(p.frozen).to.be.false;
      expect(p.owner).to.equal(agent.address);
    });
  });

  describe("Min Reputation", function () {
    beforeEach(async function () {
      await policy.connect(owner).initializePolicy(recovery.address, 3600);
    });

    it("should set min reputation", async function () {
      await policy.connect(owner).setMinReputation(owner.address, 100);
      const p = await policy.getPolicy(owner.address);
      expect(p.minReputation).to.equal(100n);
    });

    it("should emit MinReputationUpdated event", async function () {
      await expect(
        policy.connect(owner).setMinReputation(owner.address, 100)
      ).to.emit(policy, "MinReputationUpdated")
        .withArgs(owner.address, 100);
    });
  });

  describe("Identity Registry", function () {
    it("should set identity registry", async function () {
      await expect(
        policy.setIdentityRegistry(recipient.address)
      ).to.emit(policy, "IdentityRegistrySet")
        .withArgs(recipient.address);
    });

    it("should reject setting registry twice", async function () {
      await policy.setIdentityRegistry(recipient.address);
      await expect(
        policy.setIdentityRegistry(other.address)
      ).to.be.revertedWithCustomError(policy, "RegistryAlreadySet");
    });
  });
});
