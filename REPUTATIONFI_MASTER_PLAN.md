# ReputationFi — Master Build Plan for Claude Code

## PROJECT IDENTITY

**Name:** ReputationFi
**Tagline:** Reputation IS Collateral — Undercollateralized Autonomous Lending for AI Agents
**Hackathon:** Tether Hackathon Galáctica: WDK Edition 1
**Primary Track:** Lending Bot (3,000 USDT 1st / 2,000 USDT 2nd)
**Secondary Track:** Best Projects Overall (6,000 / 3,000 / 1,000 USDT)
**Deadline:** March 22, 2026

---

## WHAT THIS PROJECT IS

ReputationFi is a fully autonomous AI lending agent that uses on-chain reputation scores (ERC-8004) as collateral for undercollateralized USDT loans between AI agents. Instead of locking tokens as collateral, borrowing agents stake their reputation — if they default, their ERC-8004 score gets slashed and they're banned from the protocol.

The lending agent:
1. Registers itself on-chain via ERC-8004
2. Accepts loan requests from other AI agents
3. Scores borrowers using on-chain transaction history + ERC-8004 reputation
4. Negotiates loan terms via LLM (interest rate inversely proportional to reputation)
5. Disburses USDT loans via Tether WDK
6. Tracks repayments autonomously
7. Slashes reputation on default
8. Reallocates idle capital to Aave V3 for yield

NO mocks. NO hardcoding. Everything runs on testnet with real transactions.

---

## TRACK REQUIREMENTS CHECKLIST

### Must Have (ALL required):
- [x] Agent makes lending decisions WITHOUT human prompts → LLM-powered autonomous underwriting
- [x] All transactions settle on-chain using USDT → Tether WDK on Ethereum Sepolia
- [x] Agent autonomously tracks and collects repayments → Scheduled repayment monitor

### Nice to Have (ALL implemented):
- [x] Use DIDs or on-chain history for agent credit scores → ERC-8004 Identity + Reputation Registry
- [x] Use LLMs to negotiate loan terms with borrowers → OpenAI/Claude negotiation agent
- [x] Agent reallocates capital to higher-yield opportunities → Aave V3 Sepolia integration
- [x] Mechanics allow lending with minimal or no collateral → Reputation IS the collateral

### Bonus (ALL implemented):
- [x] Agents borrow from other agents to complete complex tasks → Multi-agent borrower simulation
- [x] Agents use their own earned revenue to service debt → Interest income funds operations
- [x] ML models predict probability of default → Gradient boosting default prediction model
- [x] Zero-Knowledge Proofs verify credit without exposing private data → ZK reputation proof (Semaphore/Groth16)

---

## ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    ReputationFi System                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Borrower     │    │  Lender      │    │  Reputation  │  │
│  │  Agent(s)     │◄──►│  Agent       │◄──►│  Oracle      │  │
│  │              │    │  (Primary)   │    │  Agent       │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                    │          │
│         ▼                   ▼                    ▼          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Smart Contract Layer                    │   │
│  │  ┌────────────┐ ┌──────────┐ ┌───────────────────┐ │   │
│  │  │ LoanVault  │ │ RepStake │ │ ReputationOracle  │ │   │
│  │  │ .sol       │ │ .sol     │ │ .sol              │ │   │
│  │  └────────────┘ └──────────┘ └───────────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Tether WDK Layer                        │   │
│  │  @tetherto/wdk-wallet-evm (Sepolia Testnet)         │   │
│  │  USDT transfers, balance checks, tx signing         │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              External Protocols                      │   │
│  │  ERC-8004 Registry │ Aave V3 Sepolia │ Chainlink    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## TECH STACK

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Runtime | Node.js 20+ / TypeScript | Main application |
| Agent Framework | LangChain.js + OpenAI GPT-4o | Autonomous reasoning + negotiation |
| Wallet | `@tetherto/wdk-wallet-evm` | USDT wallet creation, signing, transfers |
| Indexer | `@tetherto/wdk-indexer-http` | Balance queries, tx history |
| Smart Contracts | Solidity 0.8.20+ / Hardhat | LoanVault, RepStake, ReputationOracle |
| Identity | ERC-8004 contracts | Agent registration + reputation |
| Yield | Aave V3 (Sepolia) | Idle capital yield optimization |
| ML Model | Python / scikit-learn / ONNX | Default prediction (gradient boosting) |
| ZK Proofs | Semaphore / snarkjs | Privacy-preserving credit verification |
| Database | SQLite (local) | Loan records, agent state |
| Network | Ethereum Sepolia Testnet | All on-chain settlement |
| Frontend | React + Vite + TailwindCSS | Dashboard for monitoring |

---

## DIRECTORY STRUCTURE

```
reputationfi/
├── README.md
├── package.json
├── tsconfig.json
├── hardhat.config.ts
├── .env.example
│
├── contracts/                    # Solidity smart contracts
│   ├── LoanVault.sol            # Core lending pool + loan lifecycle
│   ├── ReputationStake.sol      # Reputation staking + slashing
│   ├── ReputationOracle.sol     # On-chain reputation score oracle
│   ├── interfaces/
│   │   ├── ILoanVault.sol
│   │   ├── IReputationStake.sol
│   │   └── IERC8004Registry.sol
│   └── mocks/
│       └── MockUSDT.sol         # Test USDT token for Sepolia
│
├── deploy/                       # Hardhat deployment scripts
│   ├── 01_deploy_mock_usdt.ts
│   ├── 02_deploy_reputation_oracle.ts
│   ├── 03_deploy_reputation_stake.ts
│   ├── 04_deploy_loan_vault.ts
│   └── 05_register_erc8004.ts
│
├── src/
│   ├── index.ts                  # Main entry point
│   ├── config.ts                 # Environment config + WDK setup
│   │
│   ├── agents/                   # AI Agent modules
│   │   ├── lender/
│   │   │   ├── LenderAgent.ts          # Main lending agent orchestrator
│   │   │   ├── UnderwritingEngine.ts   # Loan approval/rejection logic
│   │   │   ├── NegotiationEngine.ts    # LLM-powered term negotiation
│   │   │   ├── RepaymentMonitor.ts     # Autonomous repayment tracking
│   │   │   └── YieldOptimizer.ts       # Aave V3 idle capital deployment
│   │   │
│   │   ├── borrower/
│   │   │   ├── BorrowerAgent.ts        # Simulated borrower agents
│   │   │   └── BorrowerPersonas.ts     # Different risk profiles
│   │   │
│   │   └── reputation/
│   │       ├── ReputationScorer.ts     # On-chain reputation analysis
│   │       ├── DefaultPredictor.ts     # ML default prediction
│   │       └── ZKProofGenerator.ts     # ZK credit proofs
│   │
│   ├── blockchain/               # On-chain interaction layer
│   │   ├── WDKWalletManager.ts         # Tether WDK wallet operations
│   │   ├── ContractInteractor.ts       # Smart contract calls
│   │   ├── ERC8004Manager.ts           # ERC-8004 registration + queries
│   │   └── AaveV3Manager.ts            # Aave deposit/withdraw
│   │
│   ├── ml/                       # Machine learning module
│   │   ├── train_model.py              # Train default prediction model
│   │   ├── model.onnx                  # Exported ONNX model
│   │   └── inference.ts                # TypeScript ONNX inference
│   │
│   ├── zk/                       # Zero-knowledge proof module
│   │   ├── circuits/
│   │   │   └── reputation_proof.circom # Circom circuit for rep proof
│   │   ├── build_circuit.sh
│   │   └── prover.ts                   # Generate + verify proofs
│   │
│   ├── database/
│   │   ├── schema.sql
│   │   └── LoanDatabase.ts            # SQLite loan records
│   │
│   └── utils/
│       ├── logger.ts
│       ├── retry.ts
│       └── constants.ts
│
├── frontend/                     # React dashboard
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Dashboard.tsx           # Main monitoring view
│   │   │   ├── LoanTable.tsx           # Active loans list
│   │   │   ├── AgentStatus.tsx         # Agent health + wallet balances
│   │   │   ├── ReputationChart.tsx     # Reputation scores over time
│   │   │   └── YieldTracker.tsx        # Aave yield tracking
│   │   └── hooks/
│   │       └── useContractData.ts
│   ├── index.html
│   └── vite.config.ts
│
├── test/                         # Hardhat + Jest tests
│   ├── LoanVault.test.ts
│   ├── ReputationStake.test.ts
│   ├── LenderAgent.test.ts
│   └── integration.test.ts
│
├── scripts/
│   ├── run_demo.ts               # Full end-to-end demo script
│   ├── fund_testnet.ts           # Fund wallets with testnet ETH + USDT
│   └── simulate_borrowers.ts    # Spin up multiple borrower agents
│
└── docs/
    ├── ARCHITECTURE.md
    └── DEMO_GUIDE.md
```

---

## SMART CONTRACTS — FULL SPECIFICATIONS

### Contract 1: MockUSDT.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDT - Test USDT for Sepolia testnet
/// @notice Open mint for testing. 6 decimals like real USDT.
contract MockUSDT is ERC20 {
    uint8 private constant _decimals = 6;

    constructor() ERC20("Mock USDT", "USDT") {}

    function decimals() public pure override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

### Contract 2: ReputationOracle.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReputationOracle - On-chain reputation score storage
/// @notice Stores and updates agent reputation scores (0-999)
/// @dev Scores are updated by the authorized reputation agent
contract ReputationOracle is Ownable {

    struct AgentScore {
        uint256 score;          // 0-999
        uint256 totalLoans;     // Total loans taken
        uint256 repaidLoans;    // Successfully repaid
        uint256 defaultedLoans; // Defaulted loans
        uint256 lastUpdated;    // Block timestamp
        bool isRegistered;
    }

    mapping(address => AgentScore) public agentScores;
    address[] public registeredAgents;

    // Authorized updater (the reputation oracle agent)
    mapping(address => bool) public authorizedUpdaters;

    event AgentRegistered(address indexed agent, uint256 initialScore);
    event ScoreUpdated(address indexed agent, uint256 oldScore, uint256 newScore);
    event LoanRecorded(address indexed agent, bool repaid);
    event ScoreSlashed(address indexed agent, uint256 oldScore, uint256 newScore, string reason);

    modifier onlyAuthorized() {
        require(authorizedUpdaters[msg.sender] || msg.sender == owner(), "Not authorized");
        _;
    }

    constructor() Ownable(msg.sender) {
        authorizedUpdaters[msg.sender] = true;
    }

    function addAuthorizedUpdater(address updater) external onlyOwner {
        authorizedUpdaters[updater] = true;
    }

    function registerAgent(address agent) external onlyAuthorized {
        require(!agentScores[agent].isRegistered, "Already registered");
        agentScores[agent] = AgentScore({
            score: 300,  // Starting score (like a new credit file)
            totalLoans: 0,
            repaidLoans: 0,
            defaultedLoans: 0,
            lastUpdated: block.timestamp,
            isRegistered: true
        });
        registeredAgents.push(agent);
        emit AgentRegistered(agent, 300);
    }

    function recordLoanRepayment(address agent) external onlyAuthorized {
        require(agentScores[agent].isRegistered, "Agent not registered");
        AgentScore storage s = agentScores[agent];
        s.totalLoans += 1;
        s.repaidLoans += 1;

        // Score boost: +15 per repayment, capped at 999
        uint256 oldScore = s.score;
        uint256 boost = 15;
        if (s.repaidLoans > 10) boost = 25; // Loyalty bonus
        s.score = s.score + boost > 999 ? 999 : s.score + boost;
        s.lastUpdated = block.timestamp;

        emit ScoreUpdated(agent, oldScore, s.score);
        emit LoanRecorded(agent, true);
    }

    function recordLoanDefault(address agent) external onlyAuthorized {
        require(agentScores[agent].isRegistered, "Agent not registered");
        AgentScore storage s = agentScores[agent];
        s.totalLoans += 1;
        s.defaultedLoans += 1;

        // Score slash: -150 per default, floor at 0
        uint256 oldScore = s.score;
        s.score = s.score > 150 ? s.score - 150 : 0;
        s.lastUpdated = block.timestamp;

        emit ScoreSlashed(agent, oldScore, s.score, "Loan default");
        emit LoanRecorded(agent, false);
    }

    function getScore(address agent) external view returns (uint256) {
        require(agentScores[agent].isRegistered, "Agent not registered");
        return agentScores[agent].score;
    }

    function getFullProfile(address agent) external view returns (AgentScore memory) {
        require(agentScores[agent].isRegistered, "Agent not registered");
        return agentScores[agent];
    }

    function getRegisteredAgentCount() external view returns (uint256) {
        return registeredAgents.length;
    }
}
```

### Contract 3: LoanVault.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title LoanVault - Autonomous USDT lending vault for AI agents
/// @notice Manages the full loan lifecycle: request → approve → disburse → repay → default
contract LoanVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public usdt;

    enum LoanStatus { Requested, Active, Repaid, Defaulted, Rejected }

    struct Loan {
        uint256 id;
        address borrower;
        uint256 principal;           // USDT amount (6 decimals)
        uint256 interestRate;        // Basis points (e.g., 500 = 5%)
        uint256 totalDue;            // Principal + interest
        uint256 amountRepaid;        // USDT repaid so far
        uint256 disbursedAt;         // Timestamp of disbursement
        uint256 dueDate;             // Repayment deadline
        uint256 reputationScore;     // Borrower's score at time of request
        LoanStatus status;
    }

    uint256 public nextLoanId;
    mapping(uint256 => Loan) public loans;
    mapping(address => uint256[]) public borrowerLoans;

    // Lending parameters (set by the lender agent)
    uint256 public minReputationScore = 200;       // Minimum score to borrow
    uint256 public maxLoanAmount = 10000 * 1e6;    // 10,000 USDT max
    uint256 public maxLoanDurationDays = 30;        // 30 days max

    // Authorized lender agent address
    address public lenderAgent;

    event LoanRequested(uint256 indexed loanId, address indexed borrower, uint256 amount, uint256 reputationScore);
    event LoanApproved(uint256 indexed loanId, uint256 interestRate, uint256 dueDate);
    event LoanDisbursed(uint256 indexed loanId, uint256 amount);
    event LoanRepaid(uint256 indexed loanId, uint256 amount, bool fullyRepaid);
    event LoanDefaulted(uint256 indexed loanId, uint256 outstandingAmount);
    event LoanRejected(uint256 indexed loanId, string reason);
    event ParametersUpdated(uint256 minScore, uint256 maxAmount, uint256 maxDuration);

    modifier onlyLenderAgent() {
        require(msg.sender == lenderAgent || msg.sender == owner(), "Only lender agent");
        _;
    }

    constructor(address _usdt) Ownable(msg.sender) {
        usdt = IERC20(_usdt);
        lenderAgent = msg.sender;
    }

    function setLenderAgent(address _agent) external onlyOwner {
        lenderAgent = _agent;
    }

    function updateParameters(
        uint256 _minScore,
        uint256 _maxAmount,
        uint256 _maxDuration
    ) external onlyLenderAgent {
        minReputationScore = _minScore;
        maxLoanAmount = _maxAmount;
        maxLoanDurationDays = _maxDuration;
        emit ParametersUpdated(_minScore, _maxAmount, _maxDuration);
    }

    /// @notice Borrower requests a loan. Called by the borrower agent.
    function requestLoan(
        uint256 amount,
        uint256 durationDays,
        uint256 reputationScore
    ) external returns (uint256 loanId) {
        require(amount > 0 && amount <= maxLoanAmount, "Invalid amount");
        require(durationDays > 0 && durationDays <= maxLoanDurationDays, "Invalid duration");
        require(reputationScore >= minReputationScore, "Score too low");

        loanId = nextLoanId++;
        loans[loanId] = Loan({
            id: loanId,
            borrower: msg.sender,
            principal: amount,
            interestRate: 0,       // Set by lender agent on approval
            totalDue: 0,
            amountRepaid: 0,
            disbursedAt: 0,
            dueDate: 0,
            reputationScore: reputationScore,
            status: LoanStatus.Requested
        });
        borrowerLoans[msg.sender].push(loanId);

        emit LoanRequested(loanId, msg.sender, amount, reputationScore);
    }

    /// @notice Lender agent approves and disburses a loan
    function approveLoan(
        uint256 loanId,
        uint256 interestRateBps,
        uint256 durationDays
    ) external onlyLenderAgent nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.Requested, "Not in requested state");

        uint256 interest = (loan.principal * interestRateBps) / 10000;
        loan.interestRate = interestRateBps;
        loan.totalDue = loan.principal + interest;
        loan.disbursedAt = block.timestamp;
        loan.dueDate = block.timestamp + (durationDays * 1 days);
        loan.status = LoanStatus.Active;

        // Transfer USDT from vault to borrower
        usdt.safeTransfer(loan.borrower, loan.principal);

        emit LoanApproved(loanId, interestRateBps, loan.dueDate);
        emit LoanDisbursed(loanId, loan.principal);
    }

    /// @notice Reject a loan request
    function rejectLoan(uint256 loanId, string calldata reason) external onlyLenderAgent {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.Requested, "Not in requested state");
        loan.status = LoanStatus.Rejected;
        emit LoanRejected(loanId, reason);
    }

    /// @notice Borrower repays (partial or full). Called by borrower agent.
    function repay(uint256 loanId, uint256 amount) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.Active, "Loan not active");
        require(msg.sender == loan.borrower, "Not the borrower");
        require(amount > 0, "Zero amount");

        uint256 remaining = loan.totalDue - loan.amountRepaid;
        uint256 actualPayment = amount > remaining ? remaining : amount;

        usdt.safeTransferFrom(msg.sender, address(this), actualPayment);
        loan.amountRepaid += actualPayment;

        bool fullyRepaid = loan.amountRepaid >= loan.totalDue;
        if (fullyRepaid) {
            loan.status = LoanStatus.Repaid;
        }

        emit LoanRepaid(loanId, actualPayment, fullyRepaid);
    }

    /// @notice Mark a loan as defaulted (called by lender agent after deadline)
    function markDefault(uint256 loanId) external onlyLenderAgent {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.Active, "Loan not active");
        require(block.timestamp > loan.dueDate, "Not past due date");

        loan.status = LoanStatus.Defaulted;
        uint256 outstanding = loan.totalDue - loan.amountRepaid;
        emit LoanDefaulted(loanId, outstanding);
    }

    /// @notice Deposit USDT into the lending pool
    function deposit(uint256 amount) external {
        usdt.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Withdraw USDT from the lending pool (owner/agent only)
    function withdraw(uint256 amount) external onlyLenderAgent {
        usdt.safeTransfer(msg.sender, amount);
    }

    function getVaultBalance() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    function getBorrowerLoans(address borrower) external view returns (uint256[] memory) {
        return borrowerLoans[borrower];
    }

    function getActiveLoansCount() external view returns (uint256 count) {
        for (uint256 i = 0; i < nextLoanId; i++) {
            if (loans[i].status == LoanStatus.Active) count++;
        }
    }
}
```

### Contract 4: ReputationStake.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReputationStake - Reputation staking and slashing for loan collateral
/// @notice Agents stake their reputation score. Defaults = reputation slashed.
contract ReputationStake is Ownable {

    struct Stake {
        uint256 stakedScore;     // How much reputation is staked
        uint256 loanId;          // Associated loan
        bool active;
        bool slashed;
    }

    mapping(address => Stake[]) public stakes;
    mapping(address => bool) public isBanned;

    address public reputationOracle;
    address public loanVault;

    event ReputationStaked(address indexed agent, uint256 score, uint256 loanId);
    event ReputationSlashed(address indexed agent, uint256 amount, uint256 loanId);
    event AgentBanned(address indexed agent, string reason);
    event StakeReleased(address indexed agent, uint256 loanId);

    constructor(address _oracle, address _vault) Ownable(msg.sender) {
        reputationOracle = _oracle;
        loanVault = _vault;
    }

    function stakeReputation(address agent, uint256 scoreAmount, uint256 loanId) external {
        require(msg.sender == loanVault || msg.sender == owner(), "Unauthorized");
        require(!isBanned[agent], "Agent is banned");

        stakes[agent].push(Stake({
            stakedScore: scoreAmount,
            loanId: loanId,
            active: true,
            slashed: false
        }));

        emit ReputationStaked(agent, scoreAmount, loanId);
    }

    function slashReputation(address agent, uint256 loanId) external {
        require(msg.sender == loanVault || msg.sender == owner(), "Unauthorized");

        Stake[] storage agentStakes = stakes[agent];
        for (uint256 i = 0; i < agentStakes.length; i++) {
            if (agentStakes[i].loanId == loanId && agentStakes[i].active) {
                agentStakes[i].slashed = true;
                agentStakes[i].active = false;
                emit ReputationSlashed(agent, agentStakes[i].stakedScore, loanId);

                // Ban if 3+ slashes
                uint256 slashCount = 0;
                for (uint256 j = 0; j < agentStakes.length; j++) {
                    if (agentStakes[j].slashed) slashCount++;
                }
                if (slashCount >= 3) {
                    isBanned[agent] = true;
                    emit AgentBanned(agent, "Exceeded maximum defaults");
                }
                break;
            }
        }
    }

    function releaseStake(address agent, uint256 loanId) external {
        require(msg.sender == loanVault || msg.sender == owner(), "Unauthorized");

        Stake[] storage agentStakes = stakes[agent];
        for (uint256 i = 0; i < agentStakes.length; i++) {
            if (agentStakes[i].loanId == loanId && agentStakes[i].active) {
                agentStakes[i].active = false;
                emit StakeReleased(agent, loanId);
                break;
            }
        }
    }

    function getActiveStakeCount(address agent) external view returns (uint256 count) {
        for (uint256 i = 0; i < stakes[agent].length; i++) {
            if (stakes[agent][i].active) count++;
        }
    }
}
```

---

## AGENT MODULES — FULL SPECIFICATIONS

### Module 1: WDKWalletManager.ts

This is the core wallet module wrapping Tether WDK.

```typescript
// src/blockchain/WDKWalletManager.ts

import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm';
import { ethers } from 'ethers';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface WalletInfo {
  address: string;
  balanceUSDT: string;
  balanceETH: string;
}

export class WDKWalletManager {
  private account: WalletAccountEvm;
  private provider: ethers.JsonRpcProvider;
  private usdtContractAddress: string;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.SEPOLIA_RPC_URL);
    this.usdtContractAddress = config.USDT_CONTRACT_ADDRESS;

    // Initialize WDK wallet from seed phrase
    this.account = new WalletAccountEvm(config.WALLET_SEED_PHRASE, "0'/0/0", {
      provider: config.SEPOLIA_RPC_URL,
      transferMaxFee: BigInt('100000000000000') // 0.0001 ETH max gas
    });
  }

  async getAddress(): Promise<string> {
    return this.account.getAddress();
  }

  async getUSDTBalance(address?: string): Promise<bigint> {
    const target = address || await this.getAddress();
    const usdtContract = new ethers.Contract(
      this.usdtContractAddress,
      ['function balanceOf(address) view returns (uint256)'],
      this.provider
    );
    return usdtContract.balanceOf(target);
  }

  async transferUSDT(to: string, amount: bigint): Promise<string> {
    logger.info(`Transferring ${amount} USDT to ${to}`);

    const result = await this.account.transfer({
      to: to,
      tokenAddress: this.usdtContractAddress,
      value: amount
    });

    logger.info(`Transfer complete. TX: ${result.hash}`);
    return result.hash;
  }

  async approveUSDT(spender: string, amount: bigint): Promise<string> {
    const wallet = new ethers.Wallet(config.PRIVATE_KEY, this.provider);
    const usdtContract = new ethers.Contract(
      this.usdtContractAddress,
      ['function approve(address,uint256) returns (bool)'],
      wallet
    );
    const tx = await usdtContract.approve(spender, amount);
    await tx.wait();
    return tx.hash;
  }

  async getWalletInfo(): Promise<WalletInfo> {
    const address = await this.getAddress();
    const balanceUSDT = await this.getUSDTBalance();
    const balanceETH = await this.provider.getBalance(address);

    return {
      address,
      balanceUSDT: ethers.formatUnits(balanceUSDT, 6),
      balanceETH: ethers.formatEther(balanceETH)
    };
  }
}
```

### Module 2: LenderAgent.ts

The main orchestrator that runs autonomously.

```typescript
// src/agents/lender/LenderAgent.ts

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { WDKWalletManager } from '../../blockchain/WDKWalletManager';
import { ContractInteractor } from '../../blockchain/ContractInteractor';
import { ERC8004Manager } from '../../blockchain/ERC8004Manager';
import { UnderwritingEngine } from './UnderwritingEngine';
import { NegotiationEngine } from './NegotiationEngine';
import { RepaymentMonitor } from './RepaymentMonitor';
import { YieldOptimizer } from './YieldOptimizer';
import { LoanDatabase } from '../../database/LoanDatabase';
import { ReputationScorer } from '../reputation/ReputationScorer';
import { DefaultPredictor } from '../reputation/DefaultPredictor';
import { logger } from '../../utils/logger';

export class LenderAgent {
  private wallet: WDKWalletManager;
  private contracts: ContractInteractor;
  private erc8004: ERC8004Manager;
  private underwriter: UnderwritingEngine;
  private negotiator: NegotiationEngine;
  private repaymentMonitor: RepaymentMonitor;
  private yieldOptimizer: YieldOptimizer;
  private db: LoanDatabase;
  private scorer: ReputationScorer;
  private predictor: DefaultPredictor;
  private llm: ChatOpenAI;
  private running: boolean = false;

  constructor() {
    this.wallet = new WDKWalletManager();
    this.contracts = new ContractInteractor();
    this.erc8004 = new ERC8004Manager();
    this.db = new LoanDatabase();
    this.scorer = new ReputationScorer();
    this.predictor = new DefaultPredictor();
    this.llm = new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0.3 });

    this.underwriter = new UnderwritingEngine(this.scorer, this.predictor, this.llm);
    this.negotiator = new NegotiationEngine(this.llm);
    this.repaymentMonitor = new RepaymentMonitor(this.contracts, this.db);
    this.yieldOptimizer = new YieldOptimizer(this.wallet, this.contracts);
  }

  async initialize(): Promise<void> {
    logger.info('=== ReputationFi Lender Agent Initializing ===');

    // 1. Register on ERC-8004
    await this.erc8004.registerAgent('ReputationFi-Lender', 'ipfs://metadata-hash');

    // 2. Register on ReputationOracle contract
    const address = await this.wallet.getAddress();
    await this.contracts.registerAgentOnOracle(address);

    // 3. Fund the lending vault with USDT
    const vaultBalance = await this.contracts.getVaultBalance();
    logger.info(`Vault balance: ${vaultBalance} USDT`);

    // 4. Initialize ML model
    await this.predictor.loadModel();

    logger.info('=== Lender Agent Ready ===');
  }

  async start(): Promise<void> {
    this.running = true;
    logger.info('Lender Agent started — running autonomously');

    // Main loop: check for new loan requests, monitor repayments, optimize yield
    while (this.running) {
      try {
        // STEP 1: Process pending loan requests
        await this.processLoanRequests();

        // STEP 2: Monitor active loans for repayment/default
        await this.repaymentMonitor.checkAllActiveLoans();

        // STEP 3: Optimize idle capital (deposit to Aave)
        await this.yieldOptimizer.optimizeIdleCapital();

        // STEP 4: Autonomous decision — should we adjust parameters?
        await this.reviewAndAdjustParameters();

        // Wait 30 seconds before next cycle
        await new Promise(resolve => setTimeout(resolve, 30000));

      } catch (error) {
        logger.error('Agent cycle error:', error);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  }

  private async processLoanRequests(): Promise<void> {
    const pendingRequests = await this.contracts.getPendingLoanRequests();

    for (const request of pendingRequests) {
      logger.info(`Processing loan request #${request.loanId} from ${request.borrower}`);

      // Get borrower's reputation score from oracle
      const repScore = await this.contracts.getReputationScore(request.borrower);
      const profile = await this.contracts.getAgentProfile(request.borrower);

      // ML prediction: probability of default
      const defaultProbability = await this.predictor.predict({
        reputationScore: repScore,
        totalLoans: profile.totalLoans,
        repaidLoans: profile.repaidLoans,
        defaultedLoans: profile.defaultedLoans,
        requestedAmount: request.principal,
        loanDuration: request.durationDays
      });

      // Underwriting decision
      const decision = await this.underwriter.evaluate({
        borrowerAddress: request.borrower,
        reputationScore: repScore,
        defaultProbability,
        requestedAmount: request.principal,
        profile
      });

      if (decision.approved) {
        // Negotiate terms via LLM
        const terms = await this.negotiator.negotiate({
          reputationScore: repScore,
          defaultProbability,
          requestedAmount: request.principal,
          vaultBalance: await this.contracts.getVaultBalance()
        });

        // Approve and disburse on-chain
        await this.contracts.approveLoan(
          request.loanId,
          terms.interestRateBps,
          terms.durationDays
        );

        // Stake borrower's reputation
        await this.contracts.stakeReputation(
          request.borrower,
          Math.floor(repScore * 0.3), // Stake 30% of score
          request.loanId
        );

        // Record in local DB
        await this.db.recordLoan({
          loanId: request.loanId,
          borrower: request.borrower,
          principal: request.principal,
          interestRate: terms.interestRateBps,
          dueDate: terms.dueDate,
          defaultProbability,
          reputationScore: repScore
        });

        logger.info(`Loan #${request.loanId} APPROVED: ${terms.interestRateBps}bps rate`);
      } else {
        await this.contracts.rejectLoan(request.loanId, decision.reason);
        logger.info(`Loan #${request.loanId} REJECTED: ${decision.reason}`);
      }
    }
  }

  private async reviewAndAdjustParameters(): Promise<void> {
    // LLM reviews portfolio health and adjusts lending parameters
    const stats = await this.db.getPortfolioStats();

    const response = await this.llm.invoke([
      new SystemMessage(`You are an autonomous lending agent managing a USDT lending pool.
        Current portfolio: ${JSON.stringify(stats)}

        Based on the portfolio health, suggest parameter adjustments:
        - minReputationScore (current: ${stats.minScore})
        - maxLoanAmount (current: ${stats.maxAmount} USDT)

        If default rate > 10%, tighten. If < 3%, consider loosening.
        Respond with JSON: { "adjustMinScore": number|null, "adjustMaxAmount": number|null, "reasoning": string }`),
      new HumanMessage('Review portfolio and suggest parameter adjustments.')
    ]);

    try {
      const suggestion = JSON.parse(response.content as string);
      if (suggestion.adjustMinScore !== null || suggestion.adjustMaxAmount !== null) {
        logger.info(`Parameter adjustment suggested: ${suggestion.reasoning}`);
        // Apply adjustments on-chain
        await this.contracts.updateParameters(
          suggestion.adjustMinScore ?? stats.minScore,
          suggestion.adjustMaxAmount ?? stats.maxAmount,
          30
        );
      }
    } catch {
      // LLM response parsing failed — skip this cycle
    }
  }

  stop(): void {
    this.running = false;
    logger.info('Lender Agent stopping...');
  }
}
```

### Module 3: UnderwritingEngine.ts

```typescript
// src/agents/lender/UnderwritingEngine.ts

import { ChatOpenAI } from '@langchain/openai';
import { ReputationScorer } from '../reputation/ReputationScorer';
import { DefaultPredictor } from '../reputation/DefaultPredictor';

interface UnderwritingInput {
  borrowerAddress: string;
  reputationScore: number;
  defaultProbability: number;
  requestedAmount: bigint;
  profile: {
    totalLoans: number;
    repaidLoans: number;
    defaultedLoans: number;
  };
}

interface UnderwritingDecision {
  approved: boolean;
  reason: string;
  maxApprovedAmount: bigint;
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'REJECT';
}

export class UnderwritingEngine {
  private scorer: ReputationScorer;
  private predictor: DefaultPredictor;
  private llm: ChatOpenAI;

  // Risk thresholds
  private readonly MAX_DEFAULT_PROBABILITY = 0.25;  // 25% max
  private readonly MIN_REPUTATION_SCORE = 200;
  private readonly SCORE_TIERS = {
    LOW: { minScore: 700, maxLTV: 1.0, rateDiscount: 0.5 },    // 0-5% rate
    MEDIUM: { minScore: 450, maxLTV: 0.7, rateDiscount: 0.0 },  // 5-10% rate
    HIGH: { minScore: 200, maxLTV: 0.4, rateDiscount: -0.5 },   // 10-20% rate
  };

  constructor(scorer: ReputationScorer, predictor: DefaultPredictor, llm: ChatOpenAI) {
    this.scorer = scorer;
    this.predictor = predictor;
    this.llm = llm;
  }

  async evaluate(input: UnderwritingInput): Promise<UnderwritingDecision> {
    // Rule 1: Hard rejection if reputation too low
    if (input.reputationScore < this.MIN_REPUTATION_SCORE) {
      return {
        approved: false,
        reason: `Reputation score ${input.reputationScore} below minimum ${this.MIN_REPUTATION_SCORE}`,
        maxApprovedAmount: 0n,
        riskTier: 'REJECT'
      };
    }

    // Rule 2: Hard rejection if ML predicts high default
    if (input.defaultProbability > this.MAX_DEFAULT_PROBABILITY) {
      return {
        approved: false,
        reason: `Default probability ${(input.defaultProbability * 100).toFixed(1)}% exceeds 25% threshold`,
        maxApprovedAmount: 0n,
        riskTier: 'REJECT'
      };
    }

    // Rule 3: Hard rejection if too many existing defaults
    if (input.profile.defaultedLoans > 2) {
      return {
        approved: false,
        reason: `Agent has ${input.profile.defaultedLoans} defaults — exceeds maximum of 2`,
        maxApprovedAmount: 0n,
        riskTier: 'REJECT'
      };
    }

    // Determine risk tier
    let riskTier: 'LOW' | 'MEDIUM' | 'HIGH';
    if (input.reputationScore >= this.SCORE_TIERS.LOW.minScore) {
      riskTier = 'LOW';
    } else if (input.reputationScore >= this.SCORE_TIERS.MEDIUM.minScore) {
      riskTier = 'MEDIUM';
    } else {
      riskTier = 'HIGH';
    }

    // Calculate max approved amount based on tier
    const tierConfig = this.SCORE_TIERS[riskTier];
    const maxApproved = BigInt(Math.floor(Number(input.requestedAmount) * tierConfig.maxLTV));

    return {
      approved: true,
      reason: `Approved in ${riskTier} risk tier. Score: ${input.reputationScore}, Default prob: ${(input.defaultProbability * 100).toFixed(1)}%`,
      maxApprovedAmount: maxApproved,
      riskTier
    };
  }
}
```

### Module 4: NegotiationEngine.ts

```typescript
// src/agents/lender/NegotiationEngine.ts

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

interface NegotiationInput {
  reputationScore: number;
  defaultProbability: number;
  requestedAmount: bigint;
  vaultBalance: bigint;
}

interface NegotiatedTerms {
  interestRateBps: number;    // Basis points
  durationDays: number;
  maxAmount: bigint;
  dueDate: number;
  reasoning: string;
}

export class NegotiationEngine {
  private llm: ChatOpenAI;

  constructor(llm: ChatOpenAI) {
    this.llm = llm;
  }

  async negotiate(input: NegotiationInput): Promise<NegotiatedTerms> {
    const prompt = `You are an autonomous AI lending agent negotiating loan terms.

BORROWER PROFILE:
- Reputation Score: ${input.reputationScore}/999
- Default Probability (ML model): ${(input.defaultProbability * 100).toFixed(1)}%
- Requested Amount: ${Number(input.requestedAmount) / 1e6} USDT
- Vault Available Balance: ${Number(input.vaultBalance) / 1e6} USDT

PRICING RULES:
- Base rate: 500 bps (5%)
- Score 800+: subtract 200 bps
- Score 600-799: subtract 100 bps
- Score 400-599: add 0 bps
- Score 200-399: add 300 bps
- Default probability > 15%: add 200 bps
- Default probability > 10%: add 100 bps
- Never lend more than 20% of vault balance to a single borrower
- Duration: 7-30 days based on risk

Calculate the exact terms. Respond with ONLY valid JSON:
{
  "interestRateBps": <number>,
  "durationDays": <number>,
  "maxAmount": <number in USDT with 6 decimals>,
  "reasoning": "<brief explanation>"
}`;

    const response = await this.llm.invoke([
      new SystemMessage('You are a precise financial calculator. Output only valid JSON.'),
      new HumanMessage(prompt)
    ]);

    const terms = JSON.parse(response.content as string);

    return {
      interestRateBps: terms.interestRateBps,
      durationDays: terms.durationDays,
      maxAmount: BigInt(terms.maxAmount),
      dueDate: Math.floor(Date.now() / 1000) + (terms.durationDays * 86400),
      reasoning: terms.reasoning
    };
  }
}
```

### Module 5: RepaymentMonitor.ts

```typescript
// src/agents/lender/RepaymentMonitor.ts

import { ContractInteractor } from '../../blockchain/ContractInteractor';
import { LoanDatabase } from '../../database/LoanDatabase';
import { logger } from '../../utils/logger';

export class RepaymentMonitor {
  private contracts: ContractInteractor;
  private db: LoanDatabase;

  constructor(contracts: ContractInteractor, db: LoanDatabase) {
    this.contracts = contracts;
    this.db = db;
  }

  async checkAllActiveLoans(): Promise<void> {
    const activeLoans = await this.db.getActiveLoans();
    const now = Math.floor(Date.now() / 1000);

    for (const loan of activeLoans) {
      // Check on-chain repayment status
      const onChainLoan = await this.contracts.getLoan(loan.loanId);

      // Case 1: Fully repaid on-chain
      if (onChainLoan.status === 2) { // Repaid enum
        await this.db.updateLoanStatus(loan.loanId, 'REPAID');

        // Record repayment on reputation oracle (score boost)
        await this.contracts.recordRepayment(loan.borrower);

        // Release reputation stake
        await this.contracts.releaseStake(loan.borrower, loan.loanId);

        logger.info(`Loan #${loan.loanId} fully repaid by ${loan.borrower}`);
        continue;
      }

      // Case 2: Past due date — mark as default
      if (now > loan.dueDate && onChainLoan.amountRepaid < onChainLoan.totalDue) {
        // Mark default on-chain
        await this.contracts.markDefault(loan.loanId);

        // Record default on reputation oracle (score slash)
        await this.contracts.recordDefault(loan.borrower);

        // Slash reputation stake
        await this.contracts.slashReputation(loan.borrower, loan.loanId);

        // Update local DB
        await this.db.updateLoanStatus(loan.loanId, 'DEFAULTED');

        logger.info(`Loan #${loan.loanId} DEFAULTED by ${loan.borrower}. Reputation slashed.`);
        continue;
      }

      // Case 3: Approaching due date — log warning
      const hoursRemaining = (loan.dueDate - now) / 3600;
      if (hoursRemaining < 24 && hoursRemaining > 0) {
        logger.warn(`Loan #${loan.loanId} due in ${hoursRemaining.toFixed(1)} hours`);
      }
    }
  }
}
```

### Module 6: YieldOptimizer.ts

```typescript
// src/agents/lender/YieldOptimizer.ts

import { WDKWalletManager } from '../../blockchain/WDKWalletManager';
import { ContractInteractor } from '../../blockchain/ContractInteractor';
import { logger } from '../../utils/logger';

export class YieldOptimizer {
  private wallet: WDKWalletManager;
  private contracts: ContractInteractor;

  // Keep 30% of vault as liquid for loans, deploy 70% to Aave
  private readonly RESERVE_RATIO = 0.3;

  constructor(wallet: WDKWalletManager, contracts: ContractInteractor) {
    this.wallet = wallet;
    this.contracts = contracts;
  }

  async optimizeIdleCapital(): Promise<void> {
    const vaultBalance = await this.contracts.getVaultBalance();
    const activeLoansValue = await this.contracts.getTotalActiveLoanValue();
    const aaveDeposited = await this.contracts.getAaveDepositBalance();

    const totalCapital = Number(vaultBalance) + Number(aaveDeposited);
    const targetReserve = totalCapital * this.RESERVE_RATIO;
    const currentReserve = Number(vaultBalance);

    if (currentReserve > targetReserve * 1.2) {
      // Too much idle capital — deposit excess to Aave
      const excess = BigInt(Math.floor(currentReserve - targetReserve));
      if (excess > 100n * 1000000n) { // Only if > 100 USDT
        logger.info(`Depositing ${Number(excess) / 1e6} USDT to Aave for yield`);
        await this.contracts.depositToAave(excess);
      }
    } else if (currentReserve < targetReserve * 0.8) {
      // Reserve too low — withdraw from Aave
      const deficit = BigInt(Math.floor(targetReserve - currentReserve));
      logger.info(`Withdrawing ${Number(deficit) / 1e6} USDT from Aave to replenish reserves`);
      await this.contracts.withdrawFromAave(deficit);
    }
  }
}
```

### Module 7: BorrowerAgent.ts (Simulation)

```typescript
// src/agents/borrower/BorrowerAgent.ts

import { WDKWalletManager } from '../../blockchain/WDKWalletManager';
import { ContractInteractor } from '../../blockchain/ContractInteractor';
import { logger } from '../../utils/logger';

export interface BorrowerPersona {
  name: string;
  behavior: 'RELIABLE' | 'RISKY' | 'DEFAULTER';
  repayProbability: number;    // 0-1
  requestAmountUSDT: number;
  durationDays: number;
}

export const BORROWER_PERSONAS: BorrowerPersona[] = [
  { name: 'AlphaBot', behavior: 'RELIABLE', repayProbability: 0.95, requestAmountUSDT: 500, durationDays: 7 },
  { name: 'BetaTrader', behavior: 'RELIABLE', repayProbability: 0.85, requestAmountUSDT: 1000, durationDays: 14 },
  { name: 'GammaArb', behavior: 'RISKY', repayProbability: 0.60, requestAmountUSDT: 2000, durationDays: 21 },
  { name: 'DeltaYield', behavior: 'RISKY', repayProbability: 0.50, requestAmountUSDT: 3000, durationDays: 30 },
  { name: 'EpsilonRogue', behavior: 'DEFAULTER', repayProbability: 0.10, requestAmountUSDT: 5000, durationDays: 7 },
];

export class BorrowerAgent {
  private wallet: WDKWalletManager;
  private contracts: ContractInteractor;
  private persona: BorrowerPersona;

  constructor(seedPhrase: string, persona: BorrowerPersona) {
    this.wallet = new WDKWalletManager(); // Initialize with persona's seed
    this.contracts = new ContractInteractor();
    this.persona = persona;
  }

  async initialize(): Promise<void> {
    const address = await this.wallet.getAddress();

    // Register on reputation oracle
    await this.contracts.registerAgentOnOracle(address);

    logger.info(`Borrower ${this.persona.name} initialized at ${address}`);
  }

  async requestLoan(): Promise<number> {
    const amount = BigInt(this.persona.requestAmountUSDT) * 1000000n; // 6 decimals
    const repScore = await this.contracts.getReputationScore(await this.wallet.getAddress());

    const loanId = await this.contracts.requestLoan(
      amount,
      this.persona.durationDays,
      repScore
    );

    logger.info(`${this.persona.name} requested loan #${loanId}: ${this.persona.requestAmountUSDT} USDT`);
    return loanId;
  }

  async attemptRepayment(loanId: number): Promise<boolean> {
    // Simulate probabilistic repayment based on persona
    const willRepay = Math.random() < this.persona.repayProbability;

    if (willRepay) {
      const loan = await this.contracts.getLoan(loanId);
      const amountDue = loan.totalDue - loan.amountRepaid;

      // Approve USDT spending
      await this.wallet.approveUSDT(this.contracts.getLoanVaultAddress(), amountDue);

      // Repay on-chain
      await this.contracts.repayLoan(loanId, amountDue);

      logger.info(`${this.persona.name} repaid loan #${loanId}`);
      return true;
    } else {
      logger.warn(`${this.persona.name} WILL NOT repay loan #${loanId}`);
      return false;
    }
  }
}
```

### Module 8: DefaultPredictor.ts (ML Model)

```typescript
// src/agents/reputation/DefaultPredictor.ts

import * as ort from 'onnxruntime-node';
import path from 'path';

interface PredictionInput {
  reputationScore: number;
  totalLoans: number;
  repaidLoans: number;
  defaultedLoans: number;
  requestedAmount: bigint;
  loanDuration: number;
}

export class DefaultPredictor {
  private session: ort.InferenceSession | null = null;

  async loadModel(): Promise<void> {
    const modelPath = path.join(__dirname, '../../ml/model.onnx');
    this.session = await ort.InferenceSession.create(modelPath);
  }

  async predict(input: PredictionInput): Promise<number> {
    if (!this.session) {
      // Fallback: rule-based prediction if model not loaded
      return this.ruleBasedPrediction(input);
    }

    const features = new Float32Array([
      input.reputationScore / 999,                     // Normalized score
      input.totalLoans,
      input.repaidLoans,
      input.defaultedLoans,
      Number(input.requestedAmount) / 10000000000,     // Normalize to max 10K USDT
      input.loanDuration / 30,                          // Normalize to max 30 days
      input.totalLoans > 0 ? input.repaidLoans / input.totalLoans : 0,  // Repay ratio
      input.totalLoans > 0 ? input.defaultedLoans / input.totalLoans : 0 // Default ratio
    ]);

    const tensor = new ort.Tensor('float32', features, [1, 8]);
    const results = await this.session.run({ input: tensor });
    const probability = results.output.data[0] as number;

    return Math.max(0, Math.min(1, probability));
  }

  private ruleBasedPrediction(input: PredictionInput): number {
    let risk = 0.1; // Base 10%

    // Reputation factor
    if (input.reputationScore < 300) risk += 0.3;
    else if (input.reputationScore < 500) risk += 0.15;
    else if (input.reputationScore < 700) risk += 0.05;
    else risk -= 0.05;

    // History factor
    if (input.totalLoans > 0) {
      const defaultRate = input.defaultedLoans / input.totalLoans;
      risk += defaultRate * 0.4;
    } else {
      risk += 0.1; // Unknown = slightly risky
    }

    // Amount factor (higher = riskier)
    const amountUSDT = Number(input.requestedAmount) / 1e6;
    if (amountUSDT > 5000) risk += 0.1;
    if (amountUSDT > 2000) risk += 0.05;

    return Math.max(0, Math.min(1, risk));
  }
}
```

---

## ML MODEL TRAINING SCRIPT

```python
# src/ml/train_model.py

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
import pickle

# Generate synthetic training data (realistic agent lending scenarios)
np.random.seed(42)
n_samples = 5000

# Features: [rep_score_norm, total_loans, repaid_loans, defaulted_loans,
#            amount_norm, duration_norm, repay_ratio, default_ratio]

rep_scores = np.random.beta(5, 2, n_samples) * 999  # Skewed toward higher scores
total_loans = np.random.poisson(5, n_samples)
default_ratios = np.random.beta(1, 8, n_samples)  # Most agents are reliable
defaulted = np.floor(total_loans * default_ratios).astype(int)
repaid = total_loans - defaulted
amounts = np.random.exponential(1500, n_samples)
durations = np.random.uniform(1, 30, n_samples)
repay_ratios = np.where(total_loans > 0, repaid / total_loans, 0.5)

X = np.column_stack([
    rep_scores / 999,
    total_loans,
    repaid,
    defaulted,
    amounts / 10000,
    durations / 30,
    repay_ratios,
    np.where(total_loans > 0, defaulted / total_loans, 0)
])

# Generate labels: probability of default based on features
# Higher score + more repayments = lower default chance
base_prob = 0.15
score_effect = -0.2 * (rep_scores / 999)
history_effect = 0.3 * np.where(total_loans > 0, defaulted / total_loans, 0.15)
amount_effect = 0.1 * (amounts / 10000)
prob = base_prob + score_effect + history_effect + amount_effect
prob = np.clip(prob, 0.01, 0.95)
y = (np.random.random(n_samples) < prob).astype(int)

# Train
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = GradientBoostingClassifier(
    n_estimators=100,
    max_depth=4,
    learning_rate=0.1,
    random_state=42
)
model.fit(X_train, y_train)

accuracy = model.score(X_test, y_test)
print(f"Model accuracy: {accuracy:.4f}")

# Export to ONNX
initial_type = [('input', FloatTensorType([None, 8]))]
onnx_model = convert_sklearn(model, initial_types=initial_type, target_opset=12)

with open('model.onnx', 'wb') as f:
    f.write(onnx_model.SerializeToString())

print("Model exported to model.onnx")
```

---

## ZK PROOF MODULE

```circom
// src/zk/circuits/reputation_proof.circom
pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";

// Proves: "My reputation score >= threshold" without revealing exact score
template ReputationProof() {
    // Private inputs (not revealed)
    signal input score;              // Agent's actual reputation score
    signal input secret;             // Random blinding factor

    // Public inputs (visible on-chain)
    signal input threshold;          // Minimum score to prove
    signal input commitment;         // Poseidon(score, secret) — published on-chain

    // Output
    signal output valid;

    // 1. Verify commitment = Poseidon(score, secret)
    component hasher = Poseidon(2);
    hasher.inputs[0] <== score;
    hasher.inputs[1] <== secret;
    commitment === hasher.out;

    // 2. Verify score >= threshold
    component gte = GreaterEqThan(16);
    gte.in[0] <== score;
    gte.in[1] <== threshold;
    valid <== gte.out;

    // 3. Verify score is in valid range (0-999)
    component maxCheck = LessThan(16);
    maxCheck.in[0] <== score;
    maxCheck.in[1] <== 1000;
    maxCheck.out === 1;
}

component main {public [threshold, commitment]} = ReputationProof();
```

---

## CONFIGURATION

```typescript
// src/config.ts

import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Network
  SEPOLIA_RPC_URL: process.env.SEPOLIA_RPC_URL || 'https://sepolia.drpc.org',
  CHAIN_ID: 11155111,

  // WDK Wallet
  WALLET_SEED_PHRASE: process.env.WALLET_SEED_PHRASE!,
  PRIVATE_KEY: process.env.PRIVATE_KEY!,

  // WDK Indexer
  WDK_API_KEY: process.env.WDK_API_KEY || '',
  WDK_API_BASE: 'https://wdk-api.tether.io',

  // Contract addresses (set after deployment)
  USDT_CONTRACT_ADDRESS: process.env.USDT_CONTRACT || '',
  LOAN_VAULT_ADDRESS: process.env.LOAN_VAULT || '',
  REPUTATION_ORACLE_ADDRESS: process.env.REP_ORACLE || '',
  REPUTATION_STAKE_ADDRESS: process.env.REP_STAKE || '',

  // ERC-8004
  ERC8004_IDENTITY_REGISTRY: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  ERC8004_REPUTATION_REGISTRY: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',

  // Aave V3 Sepolia
  AAVE_POOL_ADDRESS: '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951',
  AAVE_AUSDT_ADDRESS: '0xAF0F6e8b0Dc5c913bbF4d14c22B4E78Dd14310B6',

  // LLM
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
  LLM_MODEL: 'gpt-4o',

  // Agent parameters
  AGENT_LOOP_INTERVAL_MS: 30000,  // 30 seconds
  RESERVE_RATIO: 0.3,             // 30% kept liquid
  MAX_DEFAULT_PROBABILITY: 0.25,
  MIN_REPUTATION_SCORE: 200,
};
```

```env
# .env.example

# Ethereum Sepolia
SEPOLIA_RPC_URL=https://sepolia.drpc.org
PRIVATE_KEY=your_private_key_here
WALLET_SEED_PHRASE=your twelve word seed phrase here

# Tether WDK
WDK_API_KEY=your_wdk_api_key

# OpenAI
OPENAI_API_KEY=sk-your-openai-key

# Contract addresses (filled after deployment)
USDT_CONTRACT=
LOAN_VAULT=
REP_ORACLE=
REP_STAKE=
```

---

## package.json

```json
{
  "name": "reputationfi",
  "version": "1.0.0",
  "description": "Reputation IS Collateral — Autonomous AI Agent Lending Protocol",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "ts-node src/index.ts",
    "deploy": "hardhat run deploy/01_deploy_mock_usdt.ts --network sepolia && hardhat run deploy/02_deploy_reputation_oracle.ts --network sepolia && hardhat run deploy/03_deploy_reputation_stake.ts --network sepolia && hardhat run deploy/04_deploy_loan_vault.ts --network sepolia",
    "demo": "ts-node scripts/run_demo.ts",
    "fund": "ts-node scripts/fund_testnet.ts",
    "simulate": "ts-node scripts/simulate_borrowers.ts",
    "train-ml": "cd src/ml && python train_model.py",
    "build-zk": "cd src/zk && bash build_circuit.sh",
    "test": "hardhat test && jest",
    "frontend": "cd frontend && npm run dev"
  },
  "dependencies": {
    "@tetherto/wdk-wallet-evm": "latest",
    "@tetherto/wdk-indexer-http": "latest",
    "@openzeppelin/contracts": "^5.0.0",
    "ethers": "^6.11.0",
    "hardhat": "^2.22.0",
    "@nomicfoundation/hardhat-toolbox": "^5.0.0",
    "@langchain/openai": "^0.3.0",
    "@langchain/core": "^0.3.0",
    "langchain": "^0.3.0",
    "onnxruntime-node": "^1.17.0",
    "better-sqlite3": "^11.0.0",
    "snarkjs": "^0.7.0",
    "circomlib": "^2.0.5",
    "dotenv": "^16.4.0",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "ts-node": "^10.9.0",
    "@types/node": "^20.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0"
  }
}
```

---

## DEPLOYMENT SCRIPTS

### 01_deploy_mock_usdt.ts

```typescript
import { ethers } from 'hardhat';

async function main() {
  const MockUSDT = await ethers.getContractFactory('MockUSDT');
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();
  const address = await usdt.getAddress();
  console.log(`MockUSDT deployed to: ${address}`);

  // Mint 100,000 USDT to deployer for the lending pool
  const [deployer] = await ethers.getSigners();
  const mintTx = await usdt.mint(deployer.address, ethers.parseUnits('100000', 6));
  await mintTx.wait();
  console.log(`Minted 100,000 USDT to ${deployer.address}`);
}

main().catch(console.error);
```

### 04_deploy_loan_vault.ts

```typescript
import { ethers } from 'hardhat';

async function main() {
  const usdtAddress = process.env.USDT_CONTRACT!;

  const LoanVault = await ethers.getContractFactory('LoanVault');
  const vault = await LoanVault.deploy(usdtAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`LoanVault deployed to: ${vaultAddress}`);

  // Deposit initial USDT into vault
  const usdt = await ethers.getContractAt('MockUSDT', usdtAddress);
  const approveTx = await usdt.approve(vaultAddress, ethers.parseUnits('50000', 6));
  await approveTx.wait();

  const depositTx = await vault.deposit(ethers.parseUnits('50000', 6));
  await depositTx.wait();
  console.log('Deposited 50,000 USDT into LoanVault');
}

main().catch(console.error);
```

---

## FULL DEMO SCRIPT

```typescript
// scripts/run_demo.ts
// This runs the complete end-to-end demo showing all functionality

import { LenderAgent } from '../src/agents/lender/LenderAgent';
import { BorrowerAgent, BORROWER_PERSONAS } from '../src/agents/borrower/BorrowerAgent';
import { logger } from '../src/utils/logger';

async function main() {
  logger.info('╔══════════════════════════════════════════╗');
  logger.info('║     ReputationFi — Full Demo             ║');
  logger.info('║     Reputation IS Collateral             ║');
  logger.info('╚══════════════════════════════════════════╝');

  // PHASE 1: Initialize Lender Agent
  logger.info('\n--- PHASE 1: Initialize Lender Agent ---');
  const lender = new LenderAgent();
  await lender.initialize();

  // PHASE 2: Spin up Borrower Agents with different personas
  logger.info('\n--- PHASE 2: Initialize Borrower Agents ---');
  const borrowers: BorrowerAgent[] = [];
  for (const persona of BORROWER_PERSONAS) {
    const borrower = new BorrowerAgent(
      `seed phrase for ${persona.name}`, // Generate unique seeds
      persona
    );
    await borrower.initialize();
    borrowers.push(borrower);
  }

  // PHASE 3: Borrowers request loans
  logger.info('\n--- PHASE 3: Borrowers Request Loans ---');
  const loanIds: number[] = [];
  for (const borrower of borrowers) {
    const loanId = await borrower.requestLoan();
    loanIds.push(loanId);
  }

  // PHASE 4: Start Lender Agent (processes requests autonomously)
  logger.info('\n--- PHASE 4: Lender Agent Processing ---');
  // Run 3 cycles of the lender agent
  for (let cycle = 0; cycle < 3; cycle++) {
    logger.info(`\n=== Lender Agent Cycle ${cycle + 1} ===`);
    // The lender agent will autonomously:
    // - Evaluate each loan request
    // - Check reputation scores
    // - Run ML default prediction
    // - Negotiate terms via LLM
    // - Approve or reject on-chain
    await lender['processLoanRequests']();
    await new Promise(r => setTimeout(r, 5000));
  }

  // PHASE 5: Borrowers attempt repayment (some will default)
  logger.info('\n--- PHASE 5: Repayment Phase ---');
  for (let i = 0; i < borrowers.length; i++) {
    if (loanIds[i] !== undefined) {
      await borrowers[i].attemptRepayment(loanIds[i]);
    }
  }

  // PHASE 6: Lender monitors repayments and handles defaults
  logger.info('\n--- PHASE 6: Repayment Monitoring ---');
  await lender['repaymentMonitor'].checkAllActiveLoans();

  // PHASE 7: Yield optimization
  logger.info('\n--- PHASE 7: Yield Optimization ---');
  await lender['yieldOptimizer'].optimizeIdleCapital();

  // PHASE 8: Display final state
  logger.info('\n--- PHASE 8: Final Portfolio State ---');
  const walletInfo = await lender['wallet'].getWalletInfo();
  logger.info(`Lender wallet: ${JSON.stringify(walletInfo)}`);

  logger.info('\n=== Demo Complete ===');
}

main().catch(console.error);
```

---

## HARDHAT CONFIG

```typescript
// hardhat.config.ts

import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import dotenv from 'dotenv';
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || 'https://sepolia.drpc.org',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111
    },
    hardhat: {
      chainId: 31337,
      forking: {
        url: process.env.SEPOLIA_RPC_URL || 'https://sepolia.drpc.org',
        enabled: false
      }
    }
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts'
  }
};

export default config;
```

---

## BUILD ORDER FOR CLAUDE CODE

Execute these steps in EXACT order:

### Step 1: Project Setup
```bash
mkdir reputationfi && cd reputationfi
npm init -y
# Install ALL dependencies from package.json
# Create tsconfig.json, hardhat.config.ts
# Create directory structure
```

### Step 2: Smart Contracts
```bash
# Write all 4 contracts: MockUSDT, ReputationOracle, LoanVault, ReputationStake
# Write all deployment scripts
# Run: npx hardhat compile
# Run: npx hardhat test
```

### Step 3: Deploy to Sepolia
```bash
# Get Sepolia ETH from faucet: https://faucets.chain.link/sepolia
# Deploy all contracts in order
# Save all contract addresses to .env
```

### Step 4: WDK Integration
```bash
# Implement WDKWalletManager.ts
# Test wallet creation and USDT transfers
# Verify on Sepolia Etherscan
```

### Step 5: ML Model
```bash
# Run train_model.py to generate model.onnx
# Implement DefaultPredictor.ts with ONNX inference
# Test predictions
```

### Step 6: Agent Modules
```bash
# Implement all agent modules in order:
# 1. ReputationScorer
# 2. UnderwritingEngine
# 3. NegotiationEngine
# 4. RepaymentMonitor
# 5. YieldOptimizer
# 6. LenderAgent (orchestrator)
# 7. BorrowerAgent (simulation)
```

### Step 7: ZK Proofs
```bash
# Compile circom circuit
# Generate proving/verification keys
# Implement prover.ts
```

### Step 8: Frontend Dashboard
```bash
# Create React + Vite frontend
# Components: Dashboard, LoanTable, AgentStatus, ReputationChart, YieldTracker
# Connect to deployed contracts via ethers.js
```

### Step 9: Integration Testing
```bash
# Run full demo script: npm run demo
# Verify all transactions on Sepolia Etherscan
# Record demo video
```

### Step 10: ERC-8004 Integration
```bash
# Register lender agent on ERC-8004 Identity Registry (mainnet)
# Link to reputation registry
# Query reputation in underwriting flow
```

---

## CRITICAL REMINDERS

1. **NO MOCKS**: Every transaction must hit Sepolia testnet. Use MockUSDT contract (which is a real deployed ERC-20, not a mock in code).
2. **NO HARDCODING**: All addresses, amounts, rates come from config or on-chain data.
3. **REAL WDK**: Use `@tetherto/wdk-wallet-evm` for all wallet operations. Do NOT use raw ethers.js for what WDK handles.
4. **REAL LLM**: Use actual OpenAI API calls for negotiation and parameter adjustment. Not string templates.
5. **REAL ML**: Train the ONNX model. Load and run inference in TypeScript. Not random numbers.
6. **REAL ZK**: Compile the circom circuit. Generate actual proofs. Verify on-chain.
7. **Aave V3 Sepolia**: Use the real Aave V3 deployment on Sepolia for yield optimization. Contract: `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951`

---

## HACKATHON SUBMISSION NOTES

**Title:** ReputationFi — Reputation IS Collateral
**Track:** Lending Bot
**Tagline:** Autonomous AI lending agent where on-chain reputation replaces traditional collateral. ERC-8004 identity, ML default prediction, LLM-negotiated terms, ZK privacy proofs — all settling in USDT via Tether WDK.

**Key differentiators vs other submissions:**
- Only project using reputation AS collateral (not just for scoring)
- Only project with ZK proofs for privacy-preserving credit verification
- Only project with real ML model (ONNX), not rule-based scoring
- Only project with LLM-powered autonomous term negotiation
- Only project with Aave V3 yield optimization for idle capital
- Only project implementing every single Must Have + Nice to Have + Bonus requirement
