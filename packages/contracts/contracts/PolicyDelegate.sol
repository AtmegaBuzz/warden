// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ERC-7821 Minimal Batch Executor
interface IERC7821 {
    function execute(bytes32 mode, bytes calldata executionData) external payable;
}

/// @title ERC-7710 Delegation Redemption
interface IERC7710Delegator {
    function redeemDelegations(
        bytes[] calldata delegations,
        bytes[] calldata actions
    ) external;
}

contract PolicyDelegate is ReentrancyGuard, IERC7821, IERC7710Delegator {

    string public constant VERSION = "ClawVault-PolicyDelegate-v2";

    // ============ Structs ============

    struct SessionKey {
        bool active;
        uint256 maxPerTx;
        uint256 dailyLimit;
        uint256 spent;
        uint256 windowStart;
        uint48 validAfter;
        uint48 validUntil;
        uint256 cooldownSeconds;
        uint256 lastTxTimestamp;
        uint256 txCount;
    }

    struct AgentPolicy {
        bool initialized;
        bool frozen;
        address owner;
        address recovery;
        uint256 recoveryDelay;
        uint256 recoveryInitiated;
        address pendingOwner;
    }

    // ============ State ============

    mapping(address => AgentPolicy) public policies;
    mapping(address => mapping(address => SessionKey)) public sessionKeys;
    mapping(address => mapping(address => bool)) public allowedTokens;
    mapping(address => mapping(address => bool)) public allowedRecipients;
    mapping(address => bool) public recipientAllowlistEnabled;

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

    // ERC-7715 permission lifecycle events
    event PermissionsGranted(
        address indexed eoa,
        address indexed grantee,
        uint256 maxPerTx,
        uint256 dailyLimit,
        uint48 validUntil,
        uint256 cooldownSeconds
    );
    event PermissionsRevoked(address indexed eoa, address indexed grantee);

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
        emit PermissionsGranted(eoa, key, maxPerTx, dailyLimit, validUntil, cooldownSeconds);
    }

    function revokeSessionKey(
        address eoa,
        address key
    ) external onlyOwner(eoa) {
        require(sessionKeys[eoa][key].active, "Key not active");
        sessionKeys[eoa][key].active = false;
        emit SessionKeyRevoked(eoa, key);
        emit PermissionsRevoked(eoa, key);
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

        sk.spent += value;
        sk.lastTxTimestamp = block.timestamp;
        sk.txCount += 1;

        emit TransactionValidated(eoa, sessionKey, to, value, true, "All policy checks passed");
        return true;
    }

    // ============ Delegated Execution ============

    function execute(
        address sessionKey,
        address to,
        uint256 value,
        bytes calldata data,
        address token
    ) external nonReentrant onlyInitialized(msg.sender) notFrozen(msg.sender) {
        bool approved = validateTransaction(msg.sender, sessionKey, to, value, token);
        require(approved, "Policy validation failed");

        (bool success, ) = to.call{value: value}(data);
        require(success, "Execution failed");

        emit Executed(msg.sender, to, value, data, success);
    }

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

    // ============ ERC-7821 Minimal Batch Executor ============

    /// @notice ERC-7821 execute — single or batch call with embedded session key
    /// @param mode First byte: 0x00 = single, 0x01 = batch. Bytes [1:21] = session key address.
    /// @param executionData ABI-encoded call data (single: (target,value,data), batch: (Call[]))
    function execute(
        bytes32 mode,
        bytes calldata executionData
    ) external payable override nonReentrant onlyInitialized(msg.sender) notFrozen(msg.sender) {
        uint8 modeType = uint8(mode[0]);
        address sessionKey = address(bytes20(mode << 8));

        if (modeType == 0x00) {
            (address target, uint256 value, bytes memory data) =
                abi.decode(executionData, (address, uint256, bytes));

            bool approved = validateTransaction(msg.sender, sessionKey, target, value, address(0));
            require(approved, "Policy validation failed");

            (bool success, ) = target.call{value: value}(data);
            require(success, "Execution failed");

            emit Executed(msg.sender, target, value, data, success);
        } else if (modeType == 0x01) {
            (address[] memory targets, uint256[] memory values, bytes[] memory datas) =
                abi.decode(executionData, (address[], uint256[], bytes[]));

            require(targets.length == values.length && values.length == datas.length, "Array length mismatch");
            require(targets.length > 0, "Empty batch");
            require(targets.length <= 10, "Max 10 calls per batch");

            for (uint256 i = 0; i < targets.length; i++) {
                bool approved = validateTransaction(msg.sender, sessionKey, targets[i], values[i], address(0));
                require(approved, "Policy validation failed for batch item");

                (bool success, ) = targets[i].call{value: values[i]}(datas[i]);
                require(success, "Batch execution failed");

                emit Executed(msg.sender, targets[i], values[i], datas[i], success);
            }
        } else {
            revert("Unsupported mode");
        }
    }

    // ============ ERC-7710 Delegation Redemption ============

    /// @notice ERC-7710 redeemDelegations — validate delegation-based session keys and execute actions
    /// @param delegations Each entry: abi.encode(sessionKey, validUntil, maxPerTx, dailyLimit)
    /// @param actions Each entry: abi.encode(target, value, data, token)
    function redeemDelegations(
        bytes[] calldata delegations,
        bytes[] calldata actions
    ) external override nonReentrant onlyInitialized(msg.sender) notFrozen(msg.sender) {
        require(delegations.length == actions.length, "Delegation/action length mismatch");
        require(delegations.length > 0, "Empty delegations");
        require(delegations.length <= 10, "Max 10 delegations per call");

        for (uint256 i = 0; i < delegations.length; i++) {
            (address sessionKey, uint48 validUntil, uint256 maxPerTx, uint256 dailyLimit) =
                abi.decode(delegations[i], (address, uint48, uint256, uint256));

            // Verify the delegation parameters match the on-chain session key
            SessionKey storage sk = sessionKeys[msg.sender][sessionKey];
            require(sk.active, "Session key inactive");
            require(sk.validUntil == validUntil, "validUntil mismatch");
            require(sk.maxPerTx == maxPerTx, "maxPerTx mismatch");
            require(sk.dailyLimit == dailyLimit, "dailyLimit mismatch");

            (address target, uint256 value, bytes memory data, address token) =
                abi.decode(actions[i], (address, uint256, bytes, address));

            bool approved = validateTransaction(msg.sender, sessionKey, target, value, token);
            require(approved, "Policy validation failed");

            (bool success, ) = target.call{value: value}(data);
            require(success, "Delegation execution failed");

            emit Executed(msg.sender, target, value, data, success);
        }
    }

    // ============ ERC-165 Introspection ============

    /// @notice ERC-165 interface detection
    /// @param interfaceId The interface identifier to check
    /// @return True if the contract implements the requested interface
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC7821).interfaceId
            || interfaceId == type(IERC7710Delegator).interfaceId
            || interfaceId == 0x01ffc9a7; // ERC-165
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

    function getSessionKeyList(address eoa) external view returns (address[] memory) {
        return sessionKeyList[eoa];
    }

    function getActiveSessionKeyCount(address eoa) external view returns (uint256) {
        uint256 count = 0;
        for (uint i = 0; i < sessionKeyList[eoa].length; i++) {
            if (sessionKeys[eoa][sessionKeyList[eoa][i]].active) {
                count++;
            }
        }
        return count;
    }

    function getVersion() external pure returns (string memory) {
        return VERSION;
    }
}
