// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "./IHederaScheduleService.sol";

/// @title HIP-755: Schedule Service System Contract — Authorization
/// @dev Callable at address 0x16b on Hedera
interface IHRC755 is IHederaScheduleService {
    /// @notice Authorizes the calling contract as a signer to the schedule transaction.
    /// @param schedule The address of the schedule transaction.
    /// @return responseCode The response code. SUCCESS is 22.
    function authorizeSchedule(address schedule) external returns (int64 responseCode);

    /// @notice Signs a schedule transaction with a protobuf encoded signature map.
    /// @param schedule The address of the schedule transaction.
    /// @param signatureMap The protobuf encoded signature map.
    /// @return responseCode The response code. SUCCESS is 22.
    function signSchedule(address schedule, bytes memory signatureMap) external returns (int64 responseCode);
}
