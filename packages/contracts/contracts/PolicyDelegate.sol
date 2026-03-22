// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IPolicyDelegate.sol";
import "./interfaces/IERC8004Registry.sol";

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

contract PolicyDelegate is IPolicyDelegate, ReentrancyGuard, IERC7821, IERC7710Delegator {

    string public constant VERSION = "Warden-PolicyDelegate-v4";

    // ============ Custom Errors ============

    error AlreadyInitialized();
    error InvalidRecoveryAddress();
    error RecoveryDelayTooShort(uint256 provided, uint256 minimum);
    error NotPolicyOwner();
    error PolicyNotInitialized();
    error PolicyIsFrozen();
    error InvalidSessionKey();
    error SessionKeyAlreadyActive();
    error SessionKeyExpired();
    error InvalidTimeRange();
    error MaxPerTxTooLow();
    error DailyLimitTooLow();
    error SessionKeyInactive();
    error CooldownActive(uint256 remainingSeconds);
    error ExceedsPerTxLimit(uint256 amount, uint256 limit);
    error ExceedsDailyLimit(uint256 wouldSpend, uint256 limit);
    error TokenNotAllowed(address token);
    error RecipientNotAllowed(address recipient);
    error FunctionNotAllowed(address target, bytes4 selector);
    error NotAuthorizedToFreeze();
    error NotRecoveryAddress();
    error InvalidNewOwner();
    error RecoveryNotInitiated();
    error TimelockNotExpired(uint256 currentTime, uint256 unlockTime);
    error NoRecoveryPending();
    error ArrayLengthMismatch();
    error BatchTooLarge(uint256 length, uint256 max);
    error PolicyValidationFailed(uint256 index);
    error ExecutionFailed(uint256 index);
    error InvalidNonce(uint256 provided, uint256 expected);
    error AgentNotRegistered(address agent);
    error InsufficientReputation(uint256 score, uint256 required);
    error RegistryAlreadySet();
    error BelowMinPerTx(uint256 amount, uint256 minimum);
    error MaxUsesExhausted(uint256 txCount, uint256 maxUses);
    error MaxTxPerDayExhausted(uint256 txCount, uint256 maxTxPerDay);
    error HeartbeatExpired(uint256 lastHeartbeat, uint256 interval);

    // ============ Structs ============

    struct SessionKey {
        bool active;
        uint256 maxPerTx;
        uint256 minPerTx;
        uint256 dailyLimit;
        uint256 spent;
        uint256 windowStart;
        uint48 validAfter;
        uint48 validUntil;
        uint256 cooldownSeconds;
        uint256 lastTxTimestamp;
        uint256 txCount;
        uint256 maxUses;
        uint256 maxTxPerDay;
        bool restrictFunctions;
    }

    struct AgentPolicy {
        bool initialized;
        bool frozen;
        address owner;
        address recovery;
        uint256 recoveryDelay;
        uint256 recoveryInitiated;
        address pendingOwner;
        uint256 minReputation;
        uint256 lastHeartbeat;
        uint256 heartbeatInterval;
    }

    // ============ State ============

    mapping(address => AgentPolicy) public policies;
    mapping(address => mapping(address => SessionKey)) public sessionKeys;
    mapping(address => mapping(address => bool)) public allowedTokens;
    mapping(address => mapping(address => bool)) public allowedRecipients;
    mapping(address => bool) public recipientAllowlistEnabled;

    mapping(address => address[]) public sessionKeyList;

    // Function selector permissions: eoa => sessionKey => target => selector => allowed
    mapping(address => mapping(address => mapping(address => mapping(bytes4 => bool)))) public allowedSelectors;

    // Nonce-based replay protection: eoa => sessionKey => nonce
    mapping(address => mapping(address => uint256)) public sessionNonces;

    // ERC-8004 identity registry
    IERC8004Registry public identityRegistry;

    // ============ Events ============

    event PolicyInitialized(address indexed eoa, address indexed owner);
    event SessionKeyCreated(address indexed eoa, address indexed sessionKey, uint256 maxPerTx, uint256 dailyLimit, uint48 validAfter, uint48 validUntil, uint256 cooldownSeconds);
    event SessionKeyRevoked(address indexed eoa, address indexed sessionKey);
    event TransactionValidated(address indexed eoa, address indexed sessionKey, address indexed to, uint256 value, bool approved, string reason);
    event PolicyFrozen(address indexed eoa, address indexed by);
    event PolicyUnfrozen(address indexed eoa, address indexed by);
    event RecoveryInitiated(address indexed eoa, address indexed newOwner, uint256 executeAfter);
    event RecoveryExecuted(address indexed eoa, address indexed newOwner);
    event RecoveryCancelled(address indexed eoa);
    event Executed(address indexed eoa, address indexed to, uint256 value, bytes data, bool success);
    event TokenAllowlistUpdated(address indexed eoa, address indexed token, bool allowed);
    event RecipientAllowlistUpdated(address indexed eoa, address indexed recipient, bool allowed);
    event RecipientAllowlistToggled(address indexed eoa, bool enabled);
    event SessionKeyPermissionUpdated(address indexed eoa, address indexed sessionKey, address indexed target, bytes4 selector, bool allowed);
    event MinReputationUpdated(address indexed eoa, uint256 score);
    event IdentityRegistrySet(address indexed registry);
    event HeartbeatSent(address indexed eoa, uint256 timestamp);
    event HeartbeatIntervalSet(address indexed eoa, uint256 interval);

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
        if (policies[eoa].owner != msg.sender) revert NotPolicyOwner();
        _;
    }

    modifier notFrozen(address eoa) {
        if (policies[eoa].frozen) revert PolicyIsFrozen();
        _;
    }

    modifier onlyInitialized(address eoa) {
        if (!policies[eoa].initialized) revert PolicyNotInitialized();
        _;
    }

    // ============ Initialization ============

    function initializePolicy(
        address recovery,
        uint256 recoveryDelay
    ) external {
        if (policies[msg.sender].initialized) revert AlreadyInitialized();
        if (recovery == address(0)) revert InvalidRecoveryAddress();
        if (recoveryDelay < 3600) revert RecoveryDelayTooShort(recoveryDelay, 3600);

        policies[msg.sender] = AgentPolicy({
            initialized: true,
            frozen: false,
            owner: msg.sender,
            recovery: recovery,
            recoveryDelay: recoveryDelay,
            recoveryInitiated: 0,
            pendingOwner: address(0),
            minReputation: 0,
            lastHeartbeat: block.timestamp,
            heartbeatInterval: 0
        });

        emit PolicyInitialized(msg.sender, msg.sender);
    }

    // ============ ERC-8004 Identity ============

    function setIdentityRegistry(address registry) external {
        if (address(identityRegistry) != address(0)) revert RegistryAlreadySet();
        identityRegistry = IERC8004Registry(registry);
        emit IdentityRegistrySet(registry);
    }

    function setMinReputation(address eoa, uint256 score) external onlyOwner(eoa) {
        policies[eoa].minReputation = score;
        emit MinReputationUpdated(eoa, score);
    }

    // ============ Heartbeat (Dead Man's Switch) ============

    function sendHeartbeat(address eoa) external onlyOwner(eoa) {
        policies[eoa].lastHeartbeat = block.timestamp;
        emit HeartbeatSent(eoa, block.timestamp);
    }

    function setHeartbeatInterval(address eoa, uint256 interval) external onlyOwner(eoa) {
        policies[eoa].heartbeatInterval = interval;
        policies[eoa].lastHeartbeat = block.timestamp;
        emit HeartbeatIntervalSet(eoa, interval);
    }

    // ============ Session Key Configuration ============

    function setSessionKeyLimits(
        address eoa,
        address key,
        uint256 minPerTx,
        uint256 maxUses,
        uint256 maxTxPerDay
    ) external onlyOwner(eoa) {
        sessionKeys[eoa][key].minPerTx = minPerTx;
        sessionKeys[eoa][key].maxUses = maxUses;
        sessionKeys[eoa][key].maxTxPerDay = maxTxPerDay;
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
        if (key == address(0)) revert InvalidSessionKey();
        if (sessionKeys[eoa][key].active) revert SessionKeyAlreadyActive();
        if (validUntil <= block.timestamp) revert SessionKeyExpired();
        if (validUntil <= validAfter) revert InvalidTimeRange();
        if (maxPerTx == 0) revert MaxPerTxTooLow();
        if (dailyLimit < maxPerTx) revert DailyLimitTooLow();

        // ERC-8004 reputation check
        if (policies[eoa].minReputation > 0 && address(identityRegistry) != address(0)) {
            if (!identityRegistry.isRegistered(key)) revert AgentNotRegistered(key);
            uint256 score = identityRegistry.getScore(key);
            if (score < policies[eoa].minReputation) revert InsufficientReputation(score, policies[eoa].minReputation);
        }

        sessionKeys[eoa][key] = SessionKey({
            active: true,
            maxPerTx: maxPerTx,
            minPerTx: 0,
            dailyLimit: dailyLimit,
            spent: 0,
            windowStart: block.timestamp,
            validAfter: validAfter,
            validUntil: validUntil,
            cooldownSeconds: cooldownSeconds,
            lastTxTimestamp: 0,
            txCount: 0,
            maxUses: 0,
            maxTxPerDay: 0,
            restrictFunctions: false
        });

        sessionKeyList[eoa].push(key);
        emit SessionKeyCreated(eoa, key, maxPerTx, dailyLimit, validAfter, validUntil, cooldownSeconds);
        emit PermissionsGranted(eoa, key, maxPerTx, dailyLimit, validUntil, cooldownSeconds);
    }

    function revokeSessionKey(
        address eoa,
        address key
    ) external onlyOwner(eoa) {
        if (!sessionKeys[eoa][key].active) revert SessionKeyInactive();
        sessionKeys[eoa][key].active = false;
        emit SessionKeyRevoked(eoa, key);
        emit PermissionsRevoked(eoa, key);
    }

    // ============ Function Selector Permissions ============

    function setAllowedSelector(
        address eoa,
        address sessionKey,
        address target,
        bytes4 selector,
        bool allowed
    ) external onlyOwner(eoa) {
        allowedSelectors[eoa][sessionKey][target][selector] = allowed;
        // Enable restrictFunctions on this key if setting permissions
        if (allowed && !sessionKeys[eoa][sessionKey].restrictFunctions) {
            sessionKeys[eoa][sessionKey].restrictFunctions = true;
        }
        emit SessionKeyPermissionUpdated(eoa, sessionKey, target, selector, allowed);
    }

    function setAllowedSelectorsBatch(
        address eoa,
        address sessionKey,
        address target,
        bytes4[] calldata selectors,
        bool allowed
    ) external onlyOwner(eoa) {
        if (selectors.length > 50) revert BatchTooLarge(selectors.length, 50);
        for (uint i = 0; i < selectors.length; i++) {
            allowedSelectors[eoa][sessionKey][target][selectors[i]] = allowed;
            emit SessionKeyPermissionUpdated(eoa, sessionKey, target, selectors[i], allowed);
        }
        if (allowed && !sessionKeys[eoa][sessionKey].restrictFunctions) {
            sessionKeys[eoa][sessionKey].restrictFunctions = true;
        }
    }

    // ============ Token & Recipient Allowlists ============

    function setTokenAllowed(address eoa, address token, bool allowed) external onlyOwner(eoa) {
        allowedTokens[eoa][token] = allowed;
        emit TokenAllowlistUpdated(eoa, token, allowed);
    }

    function setRecipientAllowed(address eoa, address recipient, bool allowed) external onlyOwner(eoa) {
        allowedRecipients[eoa][recipient] = allowed;
        emit RecipientAllowlistUpdated(eoa, recipient, allowed);
    }

    function setRecipientAllowlistEnabled(address eoa, bool enabled) external onlyOwner(eoa) {
        recipientAllowlistEnabled[eoa] = enabled;
        emit RecipientAllowlistToggled(eoa, enabled);
    }

    function setTokensAllowedBatch(address eoa, address[] calldata tokens, bool allowed) external onlyOwner(eoa) {
        if (tokens.length > 50) revert BatchTooLarge(tokens.length, 50);
        for (uint i = 0; i < tokens.length; i++) {
            allowedTokens[eoa][tokens[i]] = allowed;
            emit TokenAllowlistUpdated(eoa, tokens[i], allowed);
        }
    }

    function setRecipientsAllowedBatch(address eoa, address[] calldata recipients, bool allowed) external onlyOwner(eoa) {
        if (recipients.length > 50) revert BatchTooLarge(recipients.length, 50);
        for (uint i = 0; i < recipients.length; i++) {
            allowedRecipients[eoa][recipients[i]] = allowed;
            emit RecipientAllowlistUpdated(eoa, recipients[i], allowed);
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
        return _validateTransaction(eoa, sessionKey, to, value, token, "");
    }

    function validateTransactionFull(
        address eoa,
        address sessionKey,
        address to,
        uint256 value,
        address token,
        bytes calldata data
    ) public onlyInitialized(eoa) notFrozen(eoa) returns (bool) {
        return _validateTransaction(eoa, sessionKey, to, value, token, data);
    }

    function _validateTransaction(
        address eoa,
        address sessionKey,
        address to,
        uint256 value,
        address token,
        bytes memory data
    ) internal returns (bool) {
        // Heartbeat check (dead man's switch)
        AgentPolicy storage pol = policies[eoa];
        if (pol.heartbeatInterval > 0) {
            if (block.timestamp > pol.lastHeartbeat + pol.heartbeatInterval) {
                emit TransactionValidated(eoa, sessionKey, to, value, false, "Heartbeat expired");
                return false;
            }
        }

        SessionKey storage sk = sessionKeys[eoa][sessionKey];

        if (!sk.active) {
            emit TransactionValidated(eoa, sessionKey, to, value, false, "Session key inactive");
            return false;
        }

        if (block.timestamp < sk.validAfter || block.timestamp > sk.validUntil) {
            emit TransactionValidated(eoa, sessionKey, to, value, false, "Session key expired or not yet valid");
            return false;
        }

        // Max uses check
        if (sk.maxUses > 0 && sk.txCount >= sk.maxUses) {
            emit TransactionValidated(eoa, sessionKey, to, value, false, "Max uses exhausted");
            return false;
        }

        // Max tx per day check
        if (sk.maxTxPerDay > 0) {
            // Reset tx count if we're in a new day window
            uint256 dailyTxCount = sk.txCount;
            if (block.timestamp > sk.windowStart + 24 hours) {
                dailyTxCount = 0;
            }
            if (dailyTxCount >= sk.maxTxPerDay) {
                emit TransactionValidated(eoa, sessionKey, to, value, false, "Max daily transactions reached");
                return false;
            }
        }

        if (sk.cooldownSeconds > 0 && sk.lastTxTimestamp > 0) {
            if (block.timestamp < sk.lastTxTimestamp + sk.cooldownSeconds) {
                emit TransactionValidated(eoa, sessionKey, to, value, false, "Cooldown period active");
                return false;
            }
        }

        // Min per tx check (anti-dust)
        if (sk.minPerTx > 0 && value > 0 && value < sk.minPerTx) {
            emit TransactionValidated(eoa, sessionKey, to, value, false, "Below minimum per transaction");
            return false;
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

        // Function selector check
        if (sk.restrictFunctions && data.length >= 4) {
            bytes4 selector;
            assembly { selector := mload(add(data, 32)) }
            if (!allowedSelectors[eoa][sessionKey][to][selector]) {
                emit TransactionValidated(eoa, sessionKey, to, value, false, "Function not allowed");
                return false;
            }
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
        address token,
        uint256 nonce
    ) external nonReentrant onlyInitialized(msg.sender) notFrozen(msg.sender) {
        if (nonce != sessionNonces[msg.sender][sessionKey]) {
            revert InvalidNonce(nonce, sessionNonces[msg.sender][sessionKey]);
        }
        sessionNonces[msg.sender][sessionKey]++;

        bool approved = _validateTransaction(msg.sender, sessionKey, to, value, token, data);
        if (!approved) revert PolicyValidationFailed(0);

        (bool success, ) = to.call{value: value}(data);
        if (!success) revert ExecutionFailed(0);

        emit Executed(msg.sender, to, value, data, success);
    }

    function executeBatch(
        address sessionKey,
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata datas,
        address[] calldata tokens,
        uint256 nonce
    ) external nonReentrant onlyInitialized(msg.sender) notFrozen(msg.sender) {
        if (targets.length != values.length || values.length != datas.length) revert ArrayLengthMismatch();
        if (targets.length != tokens.length) revert ArrayLengthMismatch();
        if (targets.length > 10) revert BatchTooLarge(targets.length, 10);

        if (nonce != sessionNonces[msg.sender][sessionKey]) {
            revert InvalidNonce(nonce, sessionNonces[msg.sender][sessionKey]);
        }
        sessionNonces[msg.sender][sessionKey]++;

        for (uint i = 0; i < targets.length; i++) {
            bool approved = _validateTransaction(msg.sender, sessionKey, targets[i], values[i], tokens[i], datas[i]);
            if (!approved) revert PolicyValidationFailed(i);

            (bool success, ) = targets[i].call{value: values[i]}(datas[i]);
            if (!success) revert ExecutionFailed(i);

            emit Executed(msg.sender, targets[i], values[i], datas[i], success);
        }
    }

    // ============ Emergency Controls ============

    function freeze(address eoa) external onlyInitialized(eoa) {
        if (msg.sender != policies[eoa].owner && msg.sender != policies[eoa].recovery) {
            revert NotAuthorizedToFreeze();
        }
        policies[eoa].frozen = true;
        emit PolicyFrozen(eoa, msg.sender);
    }

    function unfreeze(address eoa) external onlyOwner(eoa) {
        policies[eoa].frozen = false;
        emit PolicyUnfrozen(eoa, msg.sender);
    }

    // ============ Recovery ============

    function initiateRecovery(address eoa, address newOwner) external onlyInitialized(eoa) {
        if (msg.sender != policies[eoa].recovery) revert NotRecoveryAddress();
        if (newOwner == address(0)) revert InvalidNewOwner();

        policies[eoa].recoveryInitiated = block.timestamp;
        policies[eoa].pendingOwner = newOwner;

        emit RecoveryInitiated(eoa, newOwner, block.timestamp + policies[eoa].recoveryDelay);
    }

    function executeRecovery(address eoa) external onlyInitialized(eoa) {
        AgentPolicy storage policy = policies[eoa];
        if (policy.recoveryInitiated == 0) revert RecoveryNotInitiated();
        if (block.timestamp < policy.recoveryInitiated + policy.recoveryDelay) {
            revert TimelockNotExpired(block.timestamp, policy.recoveryInitiated + policy.recoveryDelay);
        }

        address newOwner = policy.pendingOwner;
        policy.owner = newOwner;
        policy.recoveryInitiated = 0;
        policy.pendingOwner = address(0);
        policy.frozen = false;

        emit RecoveryExecuted(eoa, newOwner);
    }

    function cancelRecovery(address eoa) external onlyOwner(eoa) {
        if (policies[eoa].recoveryInitiated == 0) revert NoRecoveryPending();
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

    function getSessionKey(address eoa, address key) external view returns (
        bool active, uint256 maxPerTx, uint256 dailyLimit, uint256 spent,
        uint256 windowStart, uint48 validAfter, uint48 validUntil,
        uint256 cooldownSeconds, uint256 lastTxTimestamp, uint256 txCount
    ) {
        SessionKey storage sk = sessionKeys[eoa][key];
        return (sk.active, sk.maxPerTx, sk.dailyLimit, sk.spent,
                sk.windowStart, sk.validAfter, sk.validUntil, sk.cooldownSeconds,
                sk.lastTxTimestamp, sk.txCount);
    }

    function getSessionKeyExtended(address eoa, address key) external view returns (
        uint256 minPerTx, uint256 maxUses, uint256 maxTxPerDay, bool restrictFunctions
    ) {
        SessionKey storage sk = sessionKeys[eoa][key];
        return (sk.minPerTx, sk.maxUses, sk.maxTxPerDay, sk.restrictFunctions);
    }

    function getPolicy(address eoa) external view returns (
        bool initialized, bool frozen, address owner, address recovery,
        uint256 recoveryDelay, uint256 recoveryInitiated, address pendingOwner,
        uint256 minReputation, uint256 lastHeartbeat, uint256 heartbeatInterval
    ) {
        AgentPolicy storage p = policies[eoa];
        return (p.initialized, p.frozen, p.owner, p.recovery, p.recoveryDelay,
                p.recoveryInitiated, p.pendingOwner, p.minReputation,
                p.lastHeartbeat, p.heartbeatInterval);
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

    function getSessionNonce(address eoa, address sessionKey) external view returns (uint256) {
        return sessionNonces[eoa][sessionKey];
    }

    function getVersion() external pure returns (string memory) {
        return VERSION;
    }
}
