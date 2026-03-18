// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IPolicyDelegate.sol";
import "./interfaces/IERC8004Registry.sol";

contract PolicyDelegate is IPolicyDelegate, ReentrancyGuard {

    string public constant VERSION = "Warden-PolicyDelegate-v3";

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
            minReputation: 0
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
            dailyLimit: dailyLimit,
            spent: 0,
            windowStart: block.timestamp,
            validAfter: validAfter,
            validUntil: validUntil,
            cooldownSeconds: cooldownSeconds,
            lastTxTimestamp: 0,
            txCount: 0,
            restrictFunctions: false
        });

        sessionKeyList[eoa].push(key);
        emit SessionKeyCreated(eoa, key, maxPerTx, dailyLimit, validAfter, validUntil, cooldownSeconds);
    }

    function revokeSessionKey(
        address eoa,
        address key
    ) external onlyOwner(eoa) {
        if (!sessionKeys[eoa][key].active) revert SessionKeyInactive();
        sessionKeys[eoa][key].active = false;
        emit SessionKeyRevoked(eoa, key);
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

    // ============ View Functions ============

    function getSessionKey(address eoa, address key) external view returns (
        bool active, uint256 maxPerTx, uint256 dailyLimit, uint256 spent,
        uint256 windowStart, uint48 validAfter, uint48 validUntil,
        uint256 cooldownSeconds, uint256 lastTxTimestamp, uint256 txCount,
        bool restrictFunctions
    ) {
        SessionKey storage sk = sessionKeys[eoa][key];
        return (sk.active, sk.maxPerTx, sk.dailyLimit, sk.spent, sk.windowStart,
                sk.validAfter, sk.validUntil, sk.cooldownSeconds, sk.lastTxTimestamp,
                sk.txCount, sk.restrictFunctions);
    }

    function getPolicy(address eoa) external view returns (
        bool initialized, bool frozen, address owner, address recovery,
        uint256 recoveryDelay, uint256 recoveryInitiated, address pendingOwner,
        uint256 minReputation
    ) {
        AgentPolicy storage p = policies[eoa];
        return (p.initialized, p.frozen, p.owner, p.recovery, p.recoveryDelay,
                p.recoveryInitiated, p.pendingOwner, p.minReputation);
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
