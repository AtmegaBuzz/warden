// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC8004Registry {
    function isRegistered(address agent) external view returns (bool);
    function getScore(address agent) external view returns (uint256);
}
