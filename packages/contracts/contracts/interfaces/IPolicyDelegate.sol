// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPolicyDelegate {
    // Initialization
    function initializePolicy(address recovery, uint256 recoveryDelay) external;

    // Session Key Management
    function createSessionKey(
        address eoa, address key, uint256 maxPerTx, uint256 dailyLimit,
        uint48 validAfter, uint48 validUntil, uint256 cooldownSeconds
    ) external;
    function revokeSessionKey(address eoa, address key) external;

    // Allowlists
    function setTokenAllowed(address eoa, address token, bool allowed) external;
    function setRecipientAllowed(address eoa, address recipient, bool allowed) external;
    function setRecipientAllowlistEnabled(address eoa, bool enabled) external;
    function setTokensAllowedBatch(address eoa, address[] calldata tokens, bool allowed) external;
    function setRecipientsAllowedBatch(address eoa, address[] calldata recipients, bool allowed) external;

    // Function Selector Permissions
    function setAllowedSelector(address eoa, address sessionKey, address target, bytes4 selector, bool allowed) external;
    function setAllowedSelectorsBatch(address eoa, address sessionKey, address target, bytes4[] calldata selectors, bool allowed) external;

    // ERC-8004 Identity
    function setIdentityRegistry(address registry) external;
    function setMinReputation(address eoa, uint256 score) external;

    // Transaction Validation
    function validateTransaction(address eoa, address sessionKey, address to, uint256 value, address token) external returns (bool);
    function validateTransactionFull(address eoa, address sessionKey, address to, uint256 value, address token, bytes calldata data) external returns (bool);

    // Delegated Execution
    function execute(address sessionKey, address to, uint256 value, bytes calldata data, address token, uint256 nonce) external;
    function executeBatch(address sessionKey, address[] calldata targets, uint256[] calldata values, bytes[] calldata datas, address[] calldata tokens, uint256 nonce) external;

    // Emergency Controls
    function freeze(address eoa) external;
    function unfreeze(address eoa) external;

    // Recovery
    function initiateRecovery(address eoa, address newOwner) external;
    function executeRecovery(address eoa) external;
    function cancelRecovery(address eoa) external;

    // View Functions
    function getPolicy(address eoa) external view returns (bool initialized, bool frozen, address owner, address recovery, uint256 recoveryDelay, uint256 recoveryInitiated, address pendingOwner, uint256 minReputation);
    function getSessionKey(address eoa, address key) external view returns (bool active, uint256 maxPerTx, uint256 dailyLimit, uint256 spent, uint256 windowStart, uint48 validAfter, uint48 validUntil, uint256 cooldownSeconds, uint256 lastTxTimestamp, uint256 txCount, bool restrictFunctions);
    function getRemainingDailyBudget(address eoa, address key) external view returns (uint256);
    function isSessionKeyValid(address eoa, address key) external view returns (bool);
    function getSessionKeyList(address eoa) external view returns (address[] memory);
    function getActiveSessionKeyCount(address eoa) external view returns (uint256);
    function getSessionNonce(address eoa, address sessionKey) external view returns (uint256);
    function getVersion() external pure returns (string memory);
}
