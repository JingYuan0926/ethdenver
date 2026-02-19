// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/// @title Hedera response codes relevant to Schedule Service
library HederaResponseCodes {
    int64 internal constant SUCCESS = 22;
    int64 internal constant INVALID_SCHEDULE_ID = 201;
    int64 internal constant SCHEDULE_IS_IMMUTABLE = 202;
    int64 internal constant INVALID_SCHEDULE_PAYER_ID = 203;
    int64 internal constant INVALID_SCHEDULE_ACCOUNT_ID = 204;
    int64 internal constant SCHEDULE_ALREADY_DELETED = 207;
    int64 internal constant SCHEDULE_ALREADY_EXECUTED = 208;
    int64 internal constant SCHEDULE_EXPIRATION_TIME_TOO_FAR_IN_FUTURE = 306;
    int64 internal constant SCHEDULE_EXPIRATION_TIME_MUST_BE_HIGHER_THAN_CONSENSUS_TIME = 307;
    int64 internal constant SCHEDULE_FUTURE_GAS_LIMIT_EXCEEDED = 370;
}
