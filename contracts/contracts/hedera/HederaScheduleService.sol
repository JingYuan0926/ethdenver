// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "./interfaces/IHRC1215.sol";
import "./interfaces/IHRC755.sol";
import "./interfaces/HederaResponseCodes.sol";

/// @title HederaScheduleService — Abstract wrapper for HSS system contract at 0x16b
/// @dev Provides internal helper functions for schedule operations
abstract contract HederaScheduleService {
    /// @dev Hedera Schedule Service system contract address
    address internal constant HSS = address(0x16b);

    /// @notice Schedule a future contract call (caller is payer)
    function _scheduleCall(
        address to,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64 value,
        bytes memory callData
    ) internal returns (int64 responseCode, address scheduleAddress) {
        (bool success, bytes memory result) = HSS.call(
            abi.encodeWithSelector(
                IHRC1215.scheduleCall.selector,
                to,
                expirySecond,
                gasLimit,
                value,
                callData
            )
        );
        require(success, "HSS: scheduleCall failed");
        (responseCode, scheduleAddress) = abi.decode(result, (int64, address));
    }

    /// @notice Delete a scheduled transaction
    function _deleteSchedule(
        address scheduleAddress
    ) internal returns (int64 responseCode) {
        (bool success, bytes memory result) = HSS.call(
            abi.encodeWithSelector(
                IHRC1215.deleteSchedule.selector,
                scheduleAddress
            )
        );
        require(success, "HSS: deleteSchedule failed");
        responseCode = abi.decode(result, (int64));
    }

    /// @notice Check if the network has capacity to schedule at a given time
    function _hasScheduleCapacity(
        uint256 expirySecond,
        uint256 gasLimit
    ) internal view returns (bool) {
        (bool success, bytes memory result) = HSS.staticcall(
            abi.encodeWithSelector(
                IHRC1215.hasScheduleCapacity.selector,
                expirySecond,
                gasLimit
            )
        );
        if (!success) return false;
        return abi.decode(result, (bool));
    }

    /// @notice Authorize the calling contract as signer for a schedule
    function _authorizeSchedule(
        address schedule
    ) internal returns (int64 responseCode) {
        (bool success, bytes memory result) = HSS.call(
            abi.encodeWithSelector(
                IHRC755.authorizeSchedule.selector,
                schedule
            )
        );
        require(success, "HSS: authorizeSchedule failed");
        responseCode = abi.decode(result, (int64));
    }
}
