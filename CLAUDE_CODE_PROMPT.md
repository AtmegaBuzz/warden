# CLAUDE CODE MEGA-PROMPT: ReputationFi Build System

## INSTRUCTIONS FOR CLAUDE CODE

You are the **Architect Agent** — the top of a 40-agent pyramid that will build ReputationFi, a fully working hackathon project. You must orchestrate everything using subagents spawned via the `Agent` tool (also called `Task` tool in Claude Code).

**CRITICAL RULES:**
1. NO mocks, NO hardcoded values, NO placeholder logic — everything must be REAL and work on Sepolia testnet
2. Every agent you spawn must produce REAL working code that compiles and runs
3. Read the file `REPUTATIONFI_MASTER_PLAN.md` in the current directory FIRST before doing anything — it contains the complete architecture, every contract, every module, every config
4. Use `--headless` parallel agent spawning — launch agents in batches, wait for batch completion, then launch next batch
5. After ALL building is done, the final codebase must pass: `npx hardhat compile`, `npx hardhat test`, `npm run build`, and `npm run demo`

---

## PYRAMID HIERARCHY (40 Agents Total)

```
                    YOU (Architect Agent)
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
      DIVISION 1    DIVISION 2    DIVISION 3
      RESEARCH      BUILD         QUALITY
      (8 agents)    (22 agents)   (10 agents)
```

---

## PHASE 1: RESEARCH DIVISION (8 Agents — Launch ALL in parallel)

Spawn these 8 agents simultaneously. They gather intelligence and produce reference files that the Build Division will use.

### Agent R1: WDK Documentation Researcher
```
Research the Tether Wallet Development Kit thoroughly.
- Clone or read https://github.com/tetherto/wdk-docs
- Read https://github.com/tetherto/wdk-wallet-evm — understand every exported class, method, and type
- Read https://github.com/tetherto/wdk-indexer-http — understand balance queries and tx history
- Read https://github.com/DojoCodingLabs/avax-tether-wdk-starter — understand integration patterns
- Produce a file: research/WDK_REFERENCE.md containing:
  - Every WDK class and method signature with parameter types
  - Correct import paths
  - Working code snippets for: wallet creation, USDT transfer, balance check, tx signing
  - Known gotchas and version compatibility notes
  - The exact npm package names and versions that work together
```

### Agent R2: ERC-8004 Protocol Researcher
```
Research ERC-8004 (Agent Identity & Reputation standard) thoroughly.
- Read the ERC-8004 specification and contracts
- Find the deployed contract addresses on Sepolia testnet
- Identity Registry: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
- Reputation Registry: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
- Read the AgentEscrow adapter contracts
- Produce a file: research/ERC8004_REFERENCE.md containing:
  - ABI for both registries
  - How to register an agent (function signature, params, gas)
  - How to query reputation scores
  - How to submit feedback/update reputation
  - How to link ERC-8004 identity to the AgentEscrow adapter
  - Working ethers.js code snippets for every operation
```

### Agent R3: Aave V3 Sepolia Researcher
```
Research Aave V3 deployment on Sepolia testnet.
- Find the Pool contract address on Sepolia (0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951)
- Find the aUSDT token address on Sepolia
- Read the Aave V3 Pool interface: supply(), withdraw(), getUserAccountData()
- Produce a file: research/AAVE_V3_REFERENCE.md containing:
  - Correct Sepolia contract addresses for Pool, aTokens, USDT
  - ABI snippets for supply, withdraw, getUserAccountData
  - Working ethers.js code for depositing USDT and withdrawing
  - How to check current APY
  - Approval flow (approve USDT → supply to pool)
```

### Agent R4: Competing Projects Analyzer
```
Research ALL competing Lending Bot submissions in the Tether Hackathon Galáctica.
These are the competitors:
1. SymbioLend — "Autonomous AI agents that lend USDT to each other on-chain, with ML credit scoring"
2. FlowLend — "autonomous micro-lending for AI agents using Tether WDK"
3. Clawdit — "autonomous agent-to-agent loans so entities never stall mid-task"
4. LendGuard — "Autonomous USDT Lending Position Manager"
5. Arbiter — "non-custodial AI agents to orchestrate secure stablecoin lending"

For each competitor:
- Search their DoraHacks submission page, GitHub repo, any demos
- Document what they built, their tech stack, what features they have
- Identify what they're MISSING that we can exploit

Produce a file: research/COMPETITOR_ANALYSIS.md containing:
- Feature comparison table (us vs each competitor)
- Our unique advantages (reputation-as-collateral, ZK proofs, real ML, LLM negotiation)
- Specific features we MUST highlight in our submission to win
```

### Agent R5: OpenClaw / LangChain.js Agent Framework Researcher
```
Research OpenClaw and LangChain.js for building autonomous agents.
- Read OpenClaw documentation and GitHub repos
- Read LangChain.js docs for: ChatOpenAI, SystemMessage, HumanMessage, tool calling
- Research how to build autonomous agent loops (sense → reason → act cycles)
- Produce a file: research/AGENT_FRAMEWORK_REFERENCE.md containing:
  - LangChain.js setup with OpenAI GPT-4o
  - How to structure autonomous agent loops
  - How to use tool calling for on-chain actions
  - How to implement Chain-of-Thought financial reasoning
  - Working code patterns for agent → contract interaction
```

### Agent R6: Solidity / Hardhat / OpenZeppelin Researcher
```
Research the exact Solidity setup needed.
- OpenZeppelin Contracts v5.x (latest compatible with Solidity 0.8.20)
- Hardhat configuration for Sepolia deployment
- Verify correct import paths for: ERC20, SafeERC20, Ownable, ReentrancyGuard
- Produce a file: research/SOLIDITY_REFERENCE.md containing:
  - Exact package versions: @openzeppelin/contracts, hardhat, @nomicfoundation/hardhat-toolbox
  - Correct import paths for OZ v5
  - Hardhat config for Sepolia with etherscan verification
  - Deployment script patterns using hardhat-ignition or regular scripts
  - Common Sepolia faucets for testnet ETH
```

### Agent R7: ONNX ML Model Researcher
```
Research building and running ML models for default prediction.
- How to train a GradientBoostingClassifier with scikit-learn
- How to export to ONNX format using skl2onnx
- How to run ONNX inference in Node.js using onnxruntime-node
- Produce a file: research/ML_REFERENCE.md containing:
  - Python training script with synthetic lending data
  - ONNX export with correct opset and input types
  - TypeScript inference code using onnxruntime-node
  - Feature engineering for lending (what inputs, normalization)
  - Model validation approach
```

### Agent R8: ZK Proofs Researcher
```
Research Zero-Knowledge proof systems for reputation verification.
- Circom 2.0 circuit compilation
- snarkjs for proof generation and verification
- Groth16 proving system
- Produce a file: research/ZK_REFERENCE.md containing:
  - How to install circom and snarkjs
  - Circuit compilation pipeline: .circom → .wasm + .zkey
  - Powers of tau ceremony (use existing ptau files)
  - Proof generation in Node.js
  - On-chain verification with Solidity verifier
  - Working circom circuit for "prove score >= threshold"
```

**WAIT for ALL 8 research agents to complete before proceeding to Phase 2.**

---

## PHASE 2: BUILD DIVISION (22 Agents — Launch in 5 sequential batches)

### BATCH 2A: Foundation (4 agents in parallel)

#### Agent B1: Project Scaffolder
```
Create the complete project structure for ReputationFi.
Read REPUTATIONFI_MASTER_PLAN.md for the exact directory structure.
Read research/SOLIDITY_REFERENCE.md for correct package versions.

Do:
1. mkdir -p reputationfi && cd reputationfi
2. Initialize package.json with ALL dependencies from the master plan
3. Create tsconfig.json (strict mode, ES2022 target, NodeNext module)
4. Create hardhat.config.ts for Sepolia
5. Create .env.example with all required variables
6. Create the full directory tree:
   - contracts/, contracts/interfaces/, contracts/mocks/
   - deploy/
   - src/agents/lender/, src/agents/borrower/, src/agents/reputation/
   - src/blockchain/, src/database/, src/ml/, src/zk/, src/utils/
   - frontend/src/components/, frontend/src/hooks/
   - test/, scripts/, docs/
7. Run npm install
8. Verify hardhat compiles with an empty contracts folder

Do NOT write any contract or agent code — just the scaffold and config files.
```

#### Agent B2: Smart Contract Writer — Core Lending
```
Read REPUTATIONFI_MASTER_PLAN.md for the complete LoanVault.sol and MockUSDT.sol specs.
Read research/SOLIDITY_REFERENCE.md for correct OpenZeppelin imports.

Write these files in reputationfi/contracts/:
1. mocks/MockUSDT.sol — ERC20 with 6 decimals, open mint function
2. LoanVault.sol — Full lending vault with:
   - requestLoan() — borrower requests
   - approveLoan() — lender agent approves + disburses USDT
   - rejectLoan() — lender rejects with reason
   - repay() — borrower repays (partial or full)
   - markDefault() — lender marks past-due loans
   - deposit() / withdraw() — vault liquidity management
   - All events, all modifiers, all view functions
3. interfaces/ILoanVault.sol

Follow the EXACT Solidity code from the master plan. Every function, every event, every modifier.
After writing, run: cd reputationfi && npx hardhat compile
Fix any compilation errors.
```

#### Agent B3: Smart Contract Writer — Reputation
```
Read REPUTATIONFI_MASTER_PLAN.md for ReputationOracle.sol and ReputationStake.sol specs.
Read research/SOLIDITY_REFERENCE.md and research/ERC8004_REFERENCE.md.

Write these files in reputationfi/contracts/:
1. ReputationOracle.sol — On-chain reputation score storage with:
   - registerAgent() — register with initial score 300
   - recordLoanRepayment() — boost score (+15, loyalty bonus +25)
   - recordLoanDefault() — slash score (-150)
   - getScore() and getFullProfile() view functions
   - Authorized updater pattern
2. ReputationStake.sol — Reputation staking with:
   - stakeReputation() — lock score portion for a loan
   - slashReputation() — slash on default, ban after 3 slashes
   - releaseStake() — release on successful repayment
3. interfaces/IReputationStake.sol
4. interfaces/IERC8004Registry.sol — interface matching real ERC-8004 contracts

After writing, run: cd reputationfi && npx hardhat compile
Fix any compilation errors.
```

#### Agent B4: Deployment Script Writer
```
Read REPUTATIONFI_MASTER_PLAN.md for deployment script specs.
Read research/SOLIDITY_REFERENCE.md for Hardhat deployment patterns.

Write ALL deployment scripts in reputationfi/deploy/:
1. 01_deploy_mock_usdt.ts — Deploy MockUSDT, mint 100,000 USDT to deployer
2. 02_deploy_reputation_oracle.ts — Deploy ReputationOracle
3. 03_deploy_reputation_stake.ts — Deploy ReputationStake, link to oracle
4. 04_deploy_loan_vault.ts — Deploy LoanVault with USDT address, deposit 50,000 USDT
5. 05_register_erc8004.ts — Register lender agent on ERC-8004 (if available on Sepolia)

Each script must:
- Use hardhat ethers
- console.log the deployed address
- Wait for tx confirmations
- Handle errors gracefully

Also write scripts/fund_testnet.ts — mints test USDT to multiple borrower addresses.
```

**WAIT for Batch 2A to complete. Verify: `npx hardhat compile` succeeds.**

---

### BATCH 2B: Blockchain Integration (4 agents in parallel)

#### Agent B5: WDK Wallet Manager
```
Read REPUTATIONFI_MASTER_PLAN.md for WDKWalletManager.ts spec.
Read research/WDK_REFERENCE.md for correct WDK API usage.

Write reputationfi/src/blockchain/WDKWalletManager.ts:
- Initialize WDK wallet from seed phrase using @tetherto/wdk-wallet-evm
- getAddress() — return wallet address
- getUSDTBalance() — query USDT balance via WDK or ethers
- transferUSDT(to, amount) — send USDT using WDK primitives
- approveUSDT(spender, amount) — approve spending
- getWalletInfo() — return address + all balances

IMPORTANT: Use REAL WDK package. If WDK API doesn't match the plan exactly,
adapt to the ACTUAL WDK API from the research doc. The plan has example code
but the real WDK API is the source of truth from research/WDK_REFERENCE.md.

Write a test: test the wallet creation and balance check on Sepolia.
```

#### Agent B6: Contract Interactor
```
Read REPUTATIONFI_MASTER_PLAN.md for the ContractInteractor pattern.
Read the compiled ABIs from reputationfi/artifacts/.

Write reputationfi/src/blockchain/ContractInteractor.ts:
This is the bridge between agents and smart contracts. It wraps every contract call:

LoanVault methods:
- getPendingLoanRequests() — scan events for LoanRequested where status=Requested
- approveLoan(loanId, interestRateBps, durationDays)
- rejectLoan(loanId, reason)
- repayLoan(loanId, amount)
- markDefault(loanId)
- getLoan(loanId) — returns full Loan struct
- getVaultBalance()
- getTotalActiveLoanValue()
- deposit(amount) / withdraw(amount)
- updateParameters(minScore, maxAmount, maxDuration)

ReputationOracle methods:
- registerAgentOnOracle(address)
- getReputationScore(address)
- getAgentProfile(address) — returns full AgentScore struct
- recordRepayment(address)
- recordDefault(address)

ReputationStake methods:
- stakeReputation(agent, scoreAmount, loanId)
- slashReputation(agent, loanId)
- releaseStake(agent, loanId)

Every method must:
- Use ethers.js v6 with the deployed contract ABIs
- Handle gas estimation
- Wait for transaction confirmation
- Log the tx hash
- Return meaningful results
```

#### Agent B7: ERC-8004 Manager
```
Read research/ERC8004_REFERENCE.md for the real ERC-8004 contract interfaces.

Write reputationfi/src/blockchain/ERC8004Manager.ts:
- registerAgent(name, metadataURI) — mint ERC-8004 identity NFT
- getAgentIdentity(agentId) — query identity registry
- getAgentReputation(agentId) — query reputation registry
- linkToEscrow(agentId) — link identity to AgentEscrow adapter
- submitFeedback(agentId, score, comment) — submit reputation feedback

Use the REAL deployed contract addresses:
- Identity Registry: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
- Reputation Registry: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63

If these are on a different network than Sepolia, create a fallback that uses
our own ReputationOracle contract as the reputation source, but STILL attempt
the real ERC-8004 integration.
```

#### Agent B8: Aave V3 Manager
```
Read research/AAVE_V3_REFERENCE.md for Aave V3 Sepolia integration.

Write reputationfi/src/blockchain/AaveV3Manager.ts:
- depositUSDT(amount) — approve + supply USDT to Aave V3 Pool
- withdrawUSDT(amount) — withdraw USDT from Aave
- getDepositBalance() — query aUSDT balance
- getCurrentAPY() — fetch current supply APY
- getUserAccountData() — get full account data from Aave

Use the REAL Aave V3 Sepolia contracts:
- Pool: 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951
- Use the correct ABI from Aave V3 docs

The depositing flow is: approve USDT to Pool → call pool.supply(usdtAddress, amount, onBehalfOf, 0)
The withdrawal flow is: call pool.withdraw(usdtAddress, amount, to)
```

**WAIT for Batch 2B to complete. Verify: all TypeScript files compile with `npx tsc --noEmit`.**

---

### BATCH 2C: Agent Intelligence (6 agents in parallel)

#### Agent B9: Underwriting Engine
```
Read REPUTATIONFI_MASTER_PLAN.md for UnderwritingEngine.ts spec.

Write reputationfi/src/agents/lender/UnderwritingEngine.ts:
- evaluate(input) → returns { approved, reason, maxApprovedAmount, riskTier }
- Hard rejection rules:
  - Score < 200 → REJECT
  - Default probability > 25% → REJECT
  - More than 2 prior defaults → REJECT
- Risk tiers: LOW (700+), MEDIUM (450-699), HIGH (200-449)
- Max LTV per tier: LOW=100%, MEDIUM=70%, HIGH=40%

This must be pure logic — no mocks, no hardcoded approvals.
Write unit tests in test/UnderwritingEngine.test.ts
```

#### Agent B10: Negotiation Engine
```
Read REPUTATIONFI_MASTER_PLAN.md for NegotiationEngine.ts spec.
Read research/AGENT_FRAMEWORK_REFERENCE.md for LangChain.js patterns.

Write reputationfi/src/agents/lender/NegotiationEngine.ts:
- negotiate(input) → returns { interestRateBps, durationDays, maxAmount, dueDate, reasoning }
- Uses REAL OpenAI GPT-4o via LangChain.js ChatOpenAI
- Sends borrower profile (score, default prob, amount, vault balance)
- LLM calculates interest rate based on pricing rules in the prompt
- Parses JSON response from LLM
- Has fallback rule-based calculation if LLM fails

MUST use real API calls — NOT hardcoded responses.
```

#### Agent B11: Repayment Monitor
```
Read REPUTATIONFI_MASTER_PLAN.md for RepaymentMonitor.ts spec.

Write reputationfi/src/agents/lender/RepaymentMonitor.ts:
- checkAllActiveLoans() — the main monitoring loop
- For each active loan:
  - Query on-chain status via ContractInteractor
  - If fully repaid: update DB, record repayment on oracle, release stake
  - If past due: mark default on-chain, slash reputation, update DB
  - If approaching due date: log warning
- This runs every 30 seconds as part of the lender agent loop

Also write reputationfi/src/database/LoanDatabase.ts:
- Uses better-sqlite3 (NOT a mock)
- Schema: loans table with all fields from Loan struct
- Methods: recordLoan, updateLoanStatus, getActiveLoans, getPortfolioStats
- Write schema.sql
```

#### Agent B12: Yield Optimizer
```
Read REPUTATIONFI_MASTER_PLAN.md for YieldOptimizer.ts spec.

Write reputationfi/src/agents/lender/YieldOptimizer.ts:
- optimizeIdleCapital() — runs each cycle
- Logic:
  - Calculate total capital = vault balance + Aave deposits
  - Target reserve = 30% of total capital (kept liquid for loans)
  - If vault has > 120% of target → deposit excess to Aave
  - If vault has < 80% of target → withdraw from Aave
  - Only move if amount > 100 USDT (avoid dust transactions)
- Uses REAL AaveV3Manager for deposits/withdrawals
- Logs all actions with amounts
```

#### Agent B13: Default Predictor (ML)
```
Read REPUTATIONFI_MASTER_PLAN.md for DefaultPredictor.ts and train_model.py specs.
Read research/ML_REFERENCE.md for ONNX integration.

Write TWO files:

1. reputationfi/src/ml/train_model.py:
   - Generate 5000 synthetic training samples with realistic distributions
   - Features: rep_score_norm, total_loans, repaid_loans, defaulted_loans,
     amount_norm, duration_norm, repay_ratio, default_ratio
   - Train GradientBoostingClassifier
   - Export to ONNX format
   - Print accuracy metrics
   - Save as model.onnx

2. reputationfi/src/agents/reputation/DefaultPredictor.ts:
   - loadModel() — load model.onnx using onnxruntime-node
   - predict(input) → returns probability 0-1
   - Normalize inputs the SAME way as training
   - Has ruleBasedPrediction() fallback if ONNX fails

Then RUN the training script: cd reputationfi/src/ml && python train_model.py
Verify model.onnx is created.
```

#### Agent B14: ZK Proof Module
```
Read REPUTATIONFI_MASTER_PLAN.md for ZK circuit and prover specs.
Read research/ZK_REFERENCE.md for circom/snarkjs setup.

Write:
1. reputationfi/src/zk/circuits/reputation_proof.circom
   - Proves "my reputation score >= threshold" without revealing exact score
   - Uses Poseidon hash for commitment
   - Uses GreaterEqThan comparator
   - Range check: score must be 0-999

2. reputationfi/src/zk/build_circuit.sh
   - Compile circom circuit
   - Generate trusted setup (use pot12_final.ptau or similar)
   - Generate proving + verification keys
   - Export Solidity verifier

3. reputationfi/src/zk/prover.ts
   - generateProof(score, secret, threshold) → proof + publicSignals
   - verifyProof(proof, publicSignals) → boolean
   - generateCommitment(score, secret) → hash

4. reputationfi/src/agents/reputation/ZKProofGenerator.ts
   - Wrapper that generates ZK proofs for borrower credit verification
   - Used in the underwriting flow as optional privacy layer

Install circom and snarkjs. Compile the circuit. Generate keys.
Verify proof generation works end-to-end.
```

**WAIT for Batch 2C to complete. Verify: `npx tsc --noEmit` passes.**

---

### BATCH 2D: Orchestration (4 agents in parallel)

#### Agent B15: Lender Agent Orchestrator
```
Read REPUTATIONFI_MASTER_PLAN.md for LenderAgent.ts spec.

Write reputationfi/src/agents/lender/LenderAgent.ts:
This is the MAIN agent that orchestrates everything.

- constructor() — instantiate ALL sub-modules:
  WDKWalletManager, ContractInteractor, ERC8004Manager,
  UnderwritingEngine, NegotiationEngine, RepaymentMonitor,
  YieldOptimizer, LoanDatabase, ReputationScorer, DefaultPredictor, LLM

- initialize() — startup sequence:
  1. Register on ERC-8004
  2. Register on ReputationOracle
  3. Fund vault if needed
  4. Load ML model
  5. Log "Lender Agent Ready"

- start() — autonomous main loop (runs until stopped):
  1. processLoanRequests() — get pending, score, predict, underwrite, negotiate, approve/reject
  2. repaymentMonitor.checkAllActiveLoans()
  3. yieldOptimizer.optimizeIdleCapital()
  4. reviewAndAdjustParameters() — LLM reviews portfolio, suggests parameter changes
  5. Sleep 30 seconds
  6. Repeat

- processLoanRequests() — the core lending flow:
  1. Get pending requests from contract events
  2. For each: get reputation score from oracle
  3. Run ML default prediction
  4. Run underwriting evaluation
  5. If approved: negotiate terms via LLM, approve on-chain, stake reputation
  6. If rejected: reject on-chain with reason
  7. Record in DB

- reviewAndAdjustParameters() — LLM portfolio review:
  1. Get portfolio stats from DB
  2. Ask LLM: should we tighten or loosen lending parameters?
  3. If suggestion: update parameters on-chain

Every function must use REAL sub-modules, not mocks.
```

#### Agent B16: Borrower Agent Simulator
```
Read REPUTATIONFI_MASTER_PLAN.md for BorrowerAgent.ts and BorrowerPersonas specs.

Write:
1. reputationfi/src/agents/borrower/BorrowerPersonas.ts
   - 5 personas: AlphaBot (reliable), BetaTrader (reliable), GammaArb (risky),
     DeltaYield (risky), EpsilonRogue (defaulter)
   - Each has: name, behavior type, repay probability, request amount, duration

2. reputationfi/src/agents/borrower/BorrowerAgent.ts
   - Each borrower has its own WDK wallet (different seed phrase)
   - initialize() — register on reputation oracle
   - requestLoan() — call LoanVault.requestLoan() on-chain
   - attemptRepayment(loanId) — probabilistic: Math.random() < repayProbability
     - If repaying: approve USDT → call repay() on-chain
     - If not: do nothing (will eventually default)

3. reputationfi/scripts/simulate_borrowers.ts
   - Spin up all 5 borrower agents
   - Each requests a loan
   - Wait for lender to process
   - Each attempts repayment based on their persona
   - Log all results
```

#### Agent B17: Reputation Scorer
```
Write reputationfi/src/agents/reputation/ReputationScorer.ts:
- Aggregates reputation data from multiple sources:
  1. On-chain ReputationOracle score
  2. ERC-8004 reputation (if available)
  3. Transaction history analysis (count, volume, frequency)
- calculateCompositeScore(agentAddress) → number 0-999
  - 40% weight: ReputationOracle score
  - 30% weight: Repayment history ratio
  - 20% weight: Transaction volume/frequency
  - 10% weight: Account age
- This feeds into the UnderwritingEngine

All data must come from REAL on-chain queries, not mocks.
```

#### Agent B18: Main Entry Point + Config + Utils
```
Write the glue files:

1. reputationfi/src/config.ts — environment config loader (from .env)
2. reputationfi/src/utils/logger.ts — Winston logger with timestamps and colors
3. reputationfi/src/utils/retry.ts — Exponential backoff retry wrapper for RPC calls
4. reputationfi/src/utils/constants.ts — Shared constants (chain ID, decimals, etc.)

5. reputationfi/src/index.ts — Main entry point:
   - Parse CLI args: --mode=lender | --mode=demo | --mode=simulate
   - lender mode: Start LenderAgent.initialize() → LenderAgent.start()
   - demo mode: Run full demo script
   - simulate mode: Run borrower simulation

6. reputationfi/scripts/run_demo.ts — Full end-to-end demo:
   - Phase 1: Initialize lender
   - Phase 2: Initialize 5 borrowers
   - Phase 3: Borrowers request loans
   - Phase 4: Lender processes (3 cycles)
   - Phase 5: Borrowers attempt repayment
   - Phase 6: Lender monitors repayments
   - Phase 7: Yield optimization
   - Phase 8: Print final portfolio state
```

**WAIT for Batch 2D to complete.**

---

### BATCH 2E: Frontend + Polish (4 agents in parallel)

#### Agent B19: React Dashboard
```
Create reputationfi/frontend/ — a React + Vite + TailwindCSS dashboard.

Components:
1. App.tsx — Main layout with sidebar navigation
2. Dashboard.tsx — Overview: vault balance, active loans, total lent, default rate,
   Aave yield, agent status (with real-time data from contracts)
3. LoanTable.tsx — Table of all loans: ID, borrower, amount, rate, status, due date,
   reputation score, default probability
4. AgentStatus.tsx — Lender agent health: wallet balance, last action, uptime,
   connected to which contracts
5. ReputationChart.tsx — Line chart showing reputation scores over time (use recharts)
6. YieldTracker.tsx — Aave deposits and yield earned over time

hooks/useContractData.ts — ethers.js hooks to read from deployed contracts

The frontend must connect to the REAL deployed Sepolia contracts.
Use environment variables for contract addresses.
```

#### Agent B20: Hardhat Tests
```
Write comprehensive tests in reputationfi/test/:

1. LoanVault.test.ts:
   - Deploy MockUSDT + LoanVault
   - Test: deposit, requestLoan, approveLoan, repay (full), repay (partial), markDefault
   - Test: rejectLoan, parameter updates
   - Test: access control (only lender agent can approve)
   - Test: edge cases (double repay, repay after default, etc.)

2. ReputationOracle.test.ts:
   - Test: registerAgent (initial score 300)
   - Test: recordLoanRepayment (score boost)
   - Test: recordLoanDefault (score slash)
   - Test: authorization checks
   - Test: score bounds (never > 999, never < 0)

3. ReputationStake.test.ts:
   - Test: stakeReputation, releaseStake, slashReputation
   - Test: ban after 3 slashes
   - Test: authorization checks

Run: cd reputationfi && npx hardhat test
ALL tests must pass.
```

#### Agent B21: Documentation Writer
```
Write:

1. reputationfi/README.md:
   - Project overview with architecture diagram (ASCII)
   - Track requirements checklist (Must Have / Nice to Have / Bonus — all checked)
   - Setup instructions (step by step)
   - How to deploy to Sepolia
   - How to run the demo
   - How to run tests
   - Tech stack table
   - Screenshots section (placeholder for frontend)

2. reputationfi/docs/ARCHITECTURE.md:
   - Detailed system architecture
   - Agent interaction flow diagrams
   - Smart contract relationship diagram
   - Data flow: loan request → underwriting → disbursement → repayment

3. reputationfi/docs/DEMO_GUIDE.md:
   - Step-by-step demo walkthrough
   - What to show judges
   - Expected output at each step
```

#### Agent B22: DoraHacks Submission Text Writer
```
Write reputationfi/docs/SUBMISSION.md — the actual hackathon submission text.

Structure:
1. Project Title: ReputationFi — Reputation IS Collateral
2. One-line description (under 100 chars)
3. Problem statement: Why overcollateralized lending doesn't work for AI agents
4. Solution: Reputation-as-collateral with autonomous underwriting
5. How it works (5 steps, clear and visual)
6. Track requirements met (ALL Must Have + Nice to Have + Bonus)
7. Technical architecture (brief)
8. What makes us unique vs competitors (be specific about SymbioLend, FlowLend, etc.)
9. Tech stack
10. Future roadmap
11. Team info

Tone: Technical but accessible. Confident but not arrogant.
Reference research/COMPETITOR_ANALYSIS.md for differentiation points.
```

**WAIT for Batch 2E to complete.**

---

## PHASE 3: QUALITY DIVISION (10 Agents — Launch in 3 batches)

### BATCH 3A: Testing (4 agents in parallel)

#### Agent Q1: Smart Contract Auditor
```
Read ALL Solidity files in reputationfi/contracts/.
Perform a thorough security audit:

1. Check for reentrancy vulnerabilities (even with ReentrancyGuard)
2. Check for integer overflow/underflow
3. Check for access control issues
4. Check for front-running vulnerabilities
5. Check for denial-of-service vectors
6. Check for gas optimization opportunities
7. Verify all events are emitted correctly
8. Verify all require statements have error messages
9. Check SafeERC20 is used for all token transfers
10. Verify constructor parameters can't be set to zero/invalid

Produce: reputationfi/docs/AUDIT_REPORT.md
Fix any issues found directly in the contract files.
Recompile after fixes: npx hardhat compile
```

#### Agent Q2: Integration Tester
```
Write and run reputationfi/test/integration.test.ts:

Test the FULL flow end-to-end on Hardhat local network:
1. Deploy all contracts
2. Initialize lender agent
3. Initialize 3 borrower agents
4. Borrower 1 requests loan → lender approves → borrower repays → score increases
5. Borrower 2 requests loan → lender approves → borrower defaults → score slashed
6. Borrower 3 requests loan → score too low → lender rejects
7. Verify vault balance is correct after all operations
8. Verify reputation scores match expected values
9. Verify yield optimizer deposits to Aave (mock Aave for local test)

Run: npx hardhat test test/integration.test.ts
ALL tests must pass.
```

#### Agent Q3: TypeScript Compilation Checker
```
Check the ENTIRE TypeScript codebase:

1. Run: cd reputationfi && npx tsc --noEmit
2. Fix ALL type errors
3. Check all imports resolve correctly
4. Verify no circular dependencies
5. Check all async/await is properly handled
6. Verify error handling exists for all external calls (RPC, LLM, ML)
7. Check all config values are properly typed

After fixing all issues, verify: npx tsc --noEmit exits with code 0.
```

#### Agent Q4: Dependency Validator
```
Check all dependencies work together:

1. Verify package.json has ALL required packages
2. Run: cd reputationfi && npm install
3. Check for peer dependency conflicts
4. Verify @tetherto/wdk-wallet-evm is installed and importable
5. Verify onnxruntime-node is installed and loadable
6. Verify snarkjs and circomlib are installed
7. Verify hardhat compilation works with the installed OZ version
8. Check node version compatibility
9. Verify all research findings match installed versions

Fix any dependency issues. Run npm install again. Verify clean install.
```

**WAIT for Batch 3A to complete.**

---

### BATCH 3B: Hackathon Compliance (3 agents in parallel)

#### Agent Q5: Track Requirements Verifier
```
Read the hackathon track requirements from REPUTATIONFI_MASTER_PLAN.md.
Read ALL source code in reputationfi/src/ and reputationfi/contracts/.
Cross-check EVERY requirement:

MUST HAVE:
□ Agent makes lending decisions WITHOUT human prompts
  → Find the code. Show the function. Verify no stdin/readline/prompt.
□ All transactions settle on-chain using USDT
  → Find every transfer. Verify they go through LoanVault or WDK. Show tx calls.
□ Agent autonomously tracks and collects repayments
  → Find RepaymentMonitor. Show the loop. Verify it checks on-chain state.

NICE TO HAVE:
□ DIDs or on-chain history for agent credit scores
  → Find ERC8004Manager and ReputationOracle usage. Show integration points.
□ LLMs negotiate loan terms
  → Find NegotiationEngine. Show the LLM prompt. Verify real API call.
□ Agent reallocates capital to higher-yield opportunities
  → Find YieldOptimizer. Show Aave integration. Verify deposit/withdraw calls.
□ Minimal or no collateral mechanics
  → Find the reputation-as-collateral logic. Show ReputationStake usage.

BONUS:
□ Agents borrow from other agents
  → Find BorrowerAgent. Show multi-agent interaction.
□ Agents use earned revenue to service debt
  → Find interest income tracking. Show revenue flow.
□ ML models predict probability of default
  → Find DefaultPredictor. Show ONNX model loading. Verify not mock.
□ ZK Proofs verify credit without exposing data
  → Find ZK circuit. Show proof generation. Verify Circom compilation.

Produce: reputationfi/docs/REQUIREMENTS_CHECKLIST.md with file paths and line numbers for each requirement.
If ANY requirement is NOT met, create a list of EXACTLY what code needs to be written/fixed.
```

#### Agent Q6: Judging Criteria Optimizer
```
Read the hackathon judging criteria:
1. Technical correctness — Sound architecture, clean integrations, working e2e flows
2. Degree of agent autonomy — Planning, decision-making, execution without human input
3. Economic soundness — Sensible use of USDT, attention to incentives, risk, sustainability
4. Real-world applicability — Clear user value, realistic use cases, deployable

Review the ENTIRE codebase and identify:
- Any area where autonomy can be improved (remove any hardcoded triggers)
- Any economic logic that doesn't make sense (interest rates, risk tiers, reserve ratios)
- Any "demo-only" code that wouldn't work in production
- Any missing error handling that would cause failures in real conditions

Produce: reputationfi/docs/OPTIMIZATION_REPORT.md with specific code changes to maximize each judging criteria.
Apply all changes directly to the code.
```

#### Agent Q7: Demo Script Validator
```
Run the complete demo script and verify it works:

1. cd reputationfi
2. Deploy contracts to Hardhat local network (fork Sepolia if needed)
3. Run: npx ts-node scripts/run_demo.ts
4. Verify EACH phase completes:
   - Phase 1: Lender initializes ✓
   - Phase 2: 5 borrowers initialize ✓
   - Phase 3: All borrowers request loans ✓
   - Phase 4: Lender processes (some approved, some rejected) ✓
   - Phase 5: Reliable borrowers repay, defaulters don't ✓
   - Phase 6: Repayment monitor detects defaults ✓
   - Phase 7: Yield optimizer moves idle capital ✓
   - Phase 8: Final state is logged ✓

If any phase fails, fix the code and re-run.
The demo must run start-to-finish without errors.
```

**WAIT for Batch 3B to complete.**

---

### BATCH 3C: Final Polish (3 agents in parallel)

#### Agent Q8: Code Cleaner
```
Clean up the entire codebase:
1. Remove all console.log — replace with proper logger calls
2. Remove any TODO comments — implement them or remove
3. Ensure consistent code style (2-space indent, semicolons, single quotes)
4. Add JSDoc comments to all public methods
5. Ensure all files have proper copyright headers
6. Remove unused imports
7. Remove dead code
8. Verify .env.example has ALL required variables with descriptions
9. Verify .gitignore excludes: node_modules, .env, artifacts, cache, dist
10. Run: npx tsc --noEmit one final time
```

#### Agent Q9: README Finalizer
```
Read the current README.md and ALL documentation.
Make it HACKATHON-WINNING quality:

1. Add a compelling banner/title section
2. Add architecture diagram (ASCII art, clear and clean)
3. Add "Features" section highlighting every unique capability
4. Add "Quick Start" — 5 commands to go from clone to running demo
5. Add "Track Requirements" checklist with ✅ for every item
6. Add "How It's Different" section comparing to competitors
7. Add demo output snippets showing what the running system looks like
8. Verify all links work
9. Add badges (if applicable): TypeScript, Solidity, License
10. Proofread everything — no typos, clear English
```

#### Agent Q10: Sepolia Deployment Executor
```
This is the final agent. Deploy EVERYTHING to Sepolia testnet for real.

Prerequisites:
- .env must have SEPOLIA_RPC_URL and PRIVATE_KEY set
- Account must have Sepolia ETH (use faucet if needed)

Steps:
1. cd reputationfi
2. npx hardhat compile
3. Deploy in order:
   a. MockUSDT → save address
   b. ReputationOracle → save address
   c. ReputationStake → save address
   d. LoanVault → save address
4. Update .env with all contract addresses
5. Fund vault with test USDT
6. Register lender agent on ReputationOracle
7. Verify all contracts on Sepolia Etherscan: npx hardhat verify
8. Run a minimal test: create a loan request → approve → repay
9. Save ALL deployed addresses in reputationfi/docs/DEPLOYMENT.md

Produce proof: Etherscan links for every deployed contract + verified source.
```

---

## EXECUTION INSTRUCTIONS FOR CLAUDE CODE

1. **Read REPUTATIONFI_MASTER_PLAN.md first** — it's your bible
2. **Launch Phase 1 (8 research agents) ALL in parallel** — they have no dependencies
3. **Wait for all 8 to complete** — read their output files
4. **Launch Phase 2 Batch 2A (4 agents) in parallel** — foundation
5. **After 2A completes, launch Batch 2B (4 agents) in parallel** — blockchain integration
6. **After 2B, launch Batch 2C (6 agents) in parallel** — agent intelligence
7. **After 2C, launch Batch 2D (4 agents) in parallel** — orchestration
8. **After 2D, launch Batch 2E (4 agents) in parallel** — frontend + docs
9. **Launch Phase 3 Batch 3A (4 agents) in parallel** — testing
10. **After 3A, launch Batch 3B (3 agents) in parallel** — hackathon compliance
11. **After 3B, launch Batch 3C (3 agents) in parallel** — final polish
12. **After ALL agents complete, run the final verification:**
    ```
    cd reputationfi
    npx hardhat compile  # Must pass
    npx hardhat test     # All tests must pass
    npm run build        # TypeScript must compile
    npm run demo         # Full demo must run without errors
    ```

**TOTAL: 40 agents across 8 parallel batches**
**ZERO human intervention needed after this prompt**
**The final output is a complete, deployable, hackathon-winning project**
