// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "./IHederaScheduleService.sol";

/// @title HIP-1215: Generalized Scheduled Contract Calls
/// @dev Callable at address 0x16b on Hedera
interface IHRC1215 is IHederaScheduleService {
    /// @notice Schedules a contract call with the calling contract as payer.
    /// @param to The address of the contract to call.
    /// @param expirySecond The epoch second at which the transaction should execute/expire.
    /// @param gasLimit The maximum gas for the future call.
    /// @param value The amount of HBAR (tinybars) to send with the call.
    /// @param callData ABI-encoded function call data.
    /// @return responseCode SUCCESS is 22.
    /// @return scheduleAddress The address of the newly created scheduled transaction.
    function scheduleCall(
        address to,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64 value,
        bytes memory callData
    ) external returns (int64 responseCode, address scheduleAddress);

    /// @notice Schedules a contract call with a specified payer. Waits until expirySecond to execute.
    /// @param to The address of the contract to call.
    /// @param payer The account that will pay for the transaction.
    /// @param expirySecond The epoch second at which the transaction should execute.
    /// @param gasLimit The maximum gas for the future call.
    /// @param value The amount of HBAR (tinybars) to send with the call.
    /// @param callData ABI-encoded function call data.
    /// @return responseCode SUCCESS is 22.
    /// @return scheduleAddress The address of the newly created scheduled transaction.
    function scheduleCallWithPayer(
        address to,
        address payer,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64 value,
        bytes memory callData
    ) external returns (int64 responseCode, address scheduleAddress);

    /// @notice Schedules and executes immediately upon payer signature.
    /// @param to The address of the contract to call.
    /// @param payer The account that will pay for the transaction.
    /// @param expirySecond The epoch second at which the transaction should expire.
    /// @param gasLimit The maximum gas for the future call.
    /// @param value The amount of HBAR (tinybars) to send with the call.
    /// @param callData ABI-encoded function call data.
    /// @return responseCode SUCCESS is 22.
    /// @return scheduleAddress The address of the newly created scheduled transaction.
    function executeCallOnPayerSignature(
        address to,
        address payer,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64 value,
        bytes memory callData
    ) external returns (int64 responseCode, address scheduleAddress);

    /// @notice Deletes a previously scheduled transaction.
    /// @param scheduleAddress The address of the scheduled transaction to delete.
    /// @return responseCode SUCCESS is 22.
    function deleteSchedule(address scheduleAddress) external returns (int64 responseCode);

    /// @notice Checks if there is capacity to schedule at a given time with a gas limit.
    /// @param expirySecond The epoch second to check.
    /// @param gasLimit The gas limit to check capacity for.
    /// @return hasCapacity True if there is capacity.
    function hasScheduleCapacity(
        uint256 expirySecond,
        uint256 gasLimit
    ) external view returns (bool hasCapacity);
}
