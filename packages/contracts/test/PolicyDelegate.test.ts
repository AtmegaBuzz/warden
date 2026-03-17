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
  const DUMMY_TOKEN = "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06";

  beforeEach(async function () {
    [owner, agent, recovery, recipient] = await ethers.getSigners();

    const PolicyDelegate = await ethers.getContractFactory("PolicyDelegate");
    policy = await PolicyDelegate.deploy();
  });

  describe("Version", function () {
    it("should return correct version", async function () {
      expect(await policy.getVersion()).to.equal(
        "ClawVault-PolicyDelegate-v2"
      );
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
      await policy
        .connect(owner)
        .createSessionKey(
          owner.address,
          agent.address,
          100_000000n,
          500_000000n,
          now,
          now + 86400,
          60
        );
      const sk = await policy.getSessionKey(owner.address, agent.address);
      expect(sk.active).to.be.true;
      expect(sk.maxPerTx).to.equal(100_000000n);
      expect(sk.dailyLimit).to.equal(500_000000n);
    });

    it("should track session key in list", async function () {
      await policy
        .connect(owner)
        .createSessionKey(
          owner.address,
          agent.address,
          100_000000n,
          500_000000n,
          now,
          now + 86400,
          0
        );
      const list = await policy.getSessionKeyList(owner.address);
      expect(list).to.include(agent.address);
    });

    it("should approve transaction within limits", async function () {
      await policy
        .connect(owner)
        .createSessionKey(
          owner.address,
          agent.address,
          100_000000n,
          500_000000n,
          now,
          now + 86400,
          0
        );
      const result = await policy.validateTransaction.staticCall(
        owner.address,
        agent.address,
        recipient.address,
        50_000000n,
        ethers.ZeroAddress
      );
      expect(result).to.be.true;
    });

    it("should block transaction exceeding per-tx limit", async function () {
      await policy
        .connect(owner)
        .createSessionKey(
          owner.address,
          agent.address,
          100_000000n,
          500_000000n,
          now,
          now + 86400,
          0
        );
      const result = await policy.validateTransaction.staticCall(
        owner.address,
        agent.address,
        recipient.address,
        200_000000n,
        ethers.ZeroAddress
      );
      expect(result).to.be.false;
    });

    it("should block after daily limit exhausted", async function () {
      await policy
        .connect(owner)
        .createSessionKey(
          owner.address,
          agent.address,
          100_000000n,
          200_000000n,
          now,
          now + 86400,
          0
        );
      await policy.validateTransaction(
        owner.address,
        agent.address,
        recipient.address,
        100_000000n,
        ethers.ZeroAddress
      );
      await policy.validateTransaction(
        owner.address,
        agent.address,
        recipient.address,
        100_000000n,
        ethers.ZeroAddress
      );
      const result = await policy.validateTransaction.staticCall(
        owner.address,
        agent.address,
        recipient.address,
        50_000000n,
        ethers.ZeroAddress
      );
      expect(result).to.be.false;
    });

    it("should enforce cooldown", async function () {
      await policy
        .connect(owner)
        .createSessionKey(
          owner.address,
          agent.address,
          100_000000n,
          500_000000n,
          now,
          now + 86400,
          60
        );
      await policy.validateTransaction(
        owner.address,
        agent.address,
        recipient.address,
        10_000000n,
        ethers.ZeroAddress
      );
      const result = await policy.validateTransaction.staticCall(
        owner.address,
        agent.address,
        recipient.address,
        10_000000n,
        ethers.ZeroAddress
      );
      expect(result).to.be.false;
    });

    it("should revoke session key", async function () {
      await policy
        .connect(owner)
        .createSessionKey(
          owner.address,
          agent.address,
          100_000000n,
          500_000000n,
          now,
          now + 86400,
          0
        );
      await policy
        .connect(owner)
        .revokeSessionKey(owner.address, agent.address);
      const sk = await policy.getSessionKey(owner.address, agent.address);
      expect(sk.active).to.be.false;
    });

    it("should increment txCount on validation", async function () {
      await policy
        .connect(owner)
        .createSessionKey(
          owner.address,
          agent.address,
          100_000000n,
          500_000000n,
          now,
          now + 86400,
          0
        );
      await policy.validateTransaction(
        owner.address,
        agent.address,
        recipient.address,
        10_000000n,
        ethers.ZeroAddress
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
  });

  describe("Allowlists", function () {
    let now: number;

    beforeEach(async function () {
      await policy.connect(owner).initializePolicy(recovery.address, 3600);
      now = (await ethers.provider.getBlock("latest"))!.timestamp;
      await policy
        .connect(owner)
        .createSessionKey(
          owner.address,
          agent.address,
          100_000000n,
          500_000000n,
          now,
          now + 86400,
          0
        );
    });

    it("should block non-allowed token", async function () {
      const result = await policy.validateTransaction.staticCall(
        owner.address,
        agent.address,
        recipient.address,
        10_000000n,
        DUMMY_TOKEN
      );
      expect(result).to.be.false;
    });

    it("should allow whitelisted token", async function () {
      await policy
        .connect(owner)
        .setTokenAllowed(owner.address, DUMMY_TOKEN, true);
      const result = await policy.validateTransaction.staticCall(
        owner.address,
        agent.address,
        recipient.address,
        10_000000n,
        DUMMY_TOKEN
      );
      expect(result).to.be.true;
    });

    it("should block non-allowed recipient when allowlist enabled", async function () {
      await policy
        .connect(owner)
        .setRecipientAllowlistEnabled(owner.address, true);
      const result = await policy.validateTransaction.staticCall(
        owner.address,
        agent.address,
        recipient.address,
        10_000000n,
        ethers.ZeroAddress
      );
      expect(result).to.be.false;
    });

    it("should batch-set token allowlist", async function () {
      const fakeToken = "0x0000000000000000000000000000000000000042";
      await policy
        .connect(owner)
        .setTokensAllowedBatch(
          owner.address,
          [DUMMY_TOKEN, fakeToken],
          true
        );
      expect(
        await policy.allowedTokens(owner.address, DUMMY_TOKEN)
      ).to.be.true;
      expect(
        await policy.allowedTokens(owner.address, fakeToken)
      ).to.be.true;
    });

    it("should batch-set recipient allowlist", async function () {
      await policy.connect(owner).setRecipientAllowlistEnabled(owner.address, true);
      await policy.connect(owner).setRecipientsAllowedBatch(
        owner.address,
        [recipient.address, agent.address],
        true
      );
      expect(await policy.allowedRecipients(owner.address, recipient.address)).to.be.true;
      expect(await policy.allowedRecipients(owner.address, agent.address)).to.be.true;
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
      await policy
        .connect(owner)
        .createSessionKey(
          owner.address,
          agent.address,
          100_000000n,
          500_000000n,
          now,
          now + 86400,
          0
        );
      await policy.connect(owner).freeze(owner.address);
      await expect(
        policy.validateTransaction(
          owner.address,
          agent.address,
          recipient.address,
          10_000000n,
          ethers.ZeroAddress
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

  describe("Execution", function () {
    it("should execute via policy", async function () {
      await policy.connect(owner).initializePolicy(recovery.address, 3600);
      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 0
      );
      await expect(
        policy.connect(owner).execute(
          agent.address,
          recipient.address,
          0,
          "0x",
          ethers.ZeroAddress
        )
      ).to.not.be.reverted;
    });

    it("should execute batch via policy", async function () {
      await policy.connect(owner).initializePolicy(recovery.address, 3600);
      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 0
      );
      await expect(
        policy.connect(owner).executeBatch(
          agent.address,
          [recipient.address, recovery.address],
          [0, 0],
          ["0x", "0x"],
          [ethers.ZeroAddress, ethers.ZeroAddress]
        )
      ).to.not.be.reverted;
    });

    it("should reject batch exceeding 10 calls", async function () {
      await policy.connect(owner).initializePolicy(recovery.address, 3600);
      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      await policy.connect(owner).createSessionKey(
        owner.address, agent.address,
        100_000000n, 500_000000n, now, now + 86400, 0
      );
      const targets = Array(11).fill(recipient.address);
      const values = Array(11).fill(0);
      const datas = Array(11).fill("0x");
      const tokens = Array(11).fill(ethers.ZeroAddress);

      await expect(
        policy.connect(owner).executeBatch(
          agent.address, targets, values, datas, tokens
        )
      ).to.be.revertedWith("Max 10 calls per batch");
    });
  });

  describe("Recovery", function () {
    beforeEach(async function () {
      await policy.connect(owner).initializePolicy(recovery.address, 3600);
    });

    it("should initiate and execute recovery", async function () {
      await policy
        .connect(recovery)
        .initiateRecovery(owner.address, agent.address);
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);
      await policy.executeRecovery(owner.address);
      const p = await policy.getPolicy(owner.address);
      expect(p.owner).to.equal(agent.address);
    });

    it("should reject early recovery execution", async function () {
      await policy
        .connect(recovery)
        .initiateRecovery(owner.address, agent.address);
      await expect(
        policy.executeRecovery(owner.address)
      ).to.be.revertedWith("Timelock not expired");
    });

    it("should allow owner to cancel recovery", async function () {
      await policy
        .connect(recovery)
        .initiateRecovery(owner.address, agent.address);
      await policy.connect(owner).cancelRecovery(owner.address);
      const p = await policy.getPolicy(owner.address);
      expect(p.recoveryInitiated).to.equal(0n);
      expect(p.pendingOwner).to.equal(ethers.ZeroAddress);
    });
  });
});
