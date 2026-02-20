// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {HederaScheduleService} from "./HederaScheduleService.sol";
import {HederaResponseCodes} from "./interfaces/HederaResponseCodes.sol";

/// @title SPARKPayrollVault — Automated HSS-powered payroll + subscription for AI agents
/// @notice Uses Hedera Schedule Service (scheduleCall at 0x16b) to create self-rescheduling
///         payment loops. Supports HBAR and HTS/ERC-20 token payments. No off-chain servers required.
///         Payroll = outbound (vault → agent). Subscription = inbound (subscriber → vault).
contract SPARKPayrollVault is Ownable, ReentrancyGuard, HederaScheduleService {
    // ── Custom Errors (saves ~1KB bytecode vs string requires) ──
    error ZeroAmount();
    error IntervalTooShort();
    error Idx();
    error NotActive();
    error NotAuth();
    error AlreadySched();
    error XferFail();
    error InsufBal();
    error MaxReached();
    error ZeroAddr();
    error AlreadyExists();
    error NoRetry();
    error NoPending();
    error NoToken();
    error InsufDeposit();
    error ApproveFirst();
    error UseHbar();
    error AlreadyCancelled();
    error NotHbar();
    error GasLow();
    error InternalOnly();
    error AssocFail();
    // ── Constants ────────────────────────────────────────────
    uint256 public scheduledCallGasLimit = 2_000_000; // 2M gas — HSS precompile charges ~98% of gasLimit param; 1.5M too low. Cost ~1.74 HBAR/call at 870 gWei
    uint256 public constant MIN_INTERVAL = 10; // 10 seconds minimum (demo)
    uint256 public constant MAX_AGENTS = 50;
    uint256 public constant MAX_SUBSCRIPTIONS = 100;

    // ── HTS Token Service precompile ─────────────────────────
    address internal constant HTS_PRECOMPILE = address(0x167);

    // ── Configurable defaults (set at deploy time) ──────────
    uint256 public defaultAmount; // amount per period (tinybar or token smallest unit)
    uint256 public defaultInterval; // seconds between payments

    // ── Payment token (address(0) = HBAR, otherwise ERC-20/HTS) ──
    address public paymentToken;

    // ── Enums & Structs ─────────────────────────────────────
    enum ScheduleStatus {
        None,
        Pending,
        Executed,
        Failed,
        Cancelled
    }

    struct AgentPayroll {
        address payable agent;
        uint256 amountPerPeriod;
        uint256 intervalSeconds;
        uint256 nextPaymentTime;
        address currentScheduleAddr; // HSS schedule address
        ScheduleStatus status;
        uint256 totalPaid;
        uint256 paymentCount;
        bool active;
        string agentName;
    }

    struct ScheduleRecord {
        uint256 agentIdx;
        address scheduleAddress;
        uint256 scheduledTime;
        uint256 createdAt;
        uint256 executedAt;
        ScheduleStatus status;
    }

    // ── State ───────────────────────────────────────────────
    AgentPayroll[] public agents;
    mapping(address => uint256) public agentIndex;
    mapping(address => bool) public isAgent;

    ScheduleRecord[] public scheduleHistory;
    mapping(address => uint256) public scheduleToHistoryIndex;

    // ── Events ──────────────────────────────────────────────
    event VaultFunded(address indexed funder, uint256 amount, uint256 newBalance);
    event VaultFundedToken(address indexed funder, address indexed token, uint256 amount, uint256 newBalance);
    event VaultWithdrawn(address indexed to, uint256 amount);
    event PaymentTokenSet(address indexed token);
    event TokenAssociated(address indexed token);

    event AgentAdded(
        uint256 indexed agentIdx,
        address indexed agent,
        string name,
        uint256 amount,
        uint256 interval
    );
    event AgentRemoved(uint256 indexed agentIdx, address indexed agent);
    event AgentUpdated(
        uint256 indexed agentIdx,
        uint256 newAmount,
        uint256 newInterval
    );

    event ScheduleCreated(
        uint256 indexed agentIdx,
        address indexed scheduleAddress,
        uint256 scheduledTime
    );
    event PayrollExecuted(
        uint256 indexed agentIdx,
        address indexed agent,
        uint256 amount,
        uint256 paymentNumber
    );
    event PayrollFailed(uint256 indexed agentIdx, string reason);
    event ScheduleCancelled(
        uint256 indexed agentIdx,
        address indexed scheduleAddress
    );
    event InsufficientBalance(
        uint256 indexed agentIdx,
        uint256 required,
        uint256 available
    );
    event ScheduleCapacityUnavailable(
        uint256 indexed agentIdx,
        uint256 requestedTime
    );
    event DefaultsUpdated(uint256 newAmount, uint256 newInterval);

    // ── Constructor ─────────────────────────────────────────
    constructor(
        uint256 _defaultAmount,
        uint256 _defaultInterval
    ) Ownable(msg.sender) {
        if (_defaultAmount == 0) revert ZeroAmount();
        if (_defaultInterval < MIN_INTERVAL) revert IntervalTooShort();
        defaultAmount = _defaultAmount;
        defaultInterval = _defaultInterval;
    }

    // ── Fund Management ─────────────────────────────────────
    receive() external payable {
        emit VaultFunded(msg.sender, msg.value, address(this).balance);
    }

    function fundVault() external payable {
        if (msg.value == 0) revert ZeroAmount();
        emit VaultFunded(msg.sender, msg.value, address(this).balance);
    }

    /// @notice Fund vault with ERC-20/HTS tokens (caller must approve first)
    function fundVaultToken(uint256 amount) external {
        if (paymentToken == address(0)) revert NoToken();
        if (amount == 0) revert ZeroAmount();
        bool ok = IERC20(paymentToken).transferFrom(msg.sender, address(this), amount);
        if (!ok) revert XferFail();
        uint256 bal = IERC20(paymentToken).balanceOf(address(this));
        emit VaultFundedToken(msg.sender, paymentToken, amount, bal);
    }

    function withdrawExcess(uint256 amount) external onlyOwner {
        if (paymentToken == address(0)) {
            if (amount > address(this).balance) revert InsufBal();
            (bool sent, ) = payable(owner()).call{value: amount}("");
            if (!sent) revert XferFail();
        } else {
            uint256 bal = IERC20(paymentToken).balanceOf(address(this));
            if (amount > bal) revert InsufBal();
            bool ok = IERC20(paymentToken).transfer(owner(), amount);
            if (!ok) revert XferFail();
        }
        emit VaultWithdrawn(owner(), amount);
    }

    // ── Payment Token Config ─────────────────────────────────
    /// @notice Set the payment token (address(0) = HBAR, otherwise ERC-20/HTS)
    function setPaymentToken(address token) external onlyOwner {
        paymentToken = token;
        emit PaymentTokenSet(token);
    }

    /// @notice Associate this contract with an HTS token (required before receiving)
    function associateToken(address token) external onlyOwner {
        (bool success, bytes memory result) = HTS_PRECOMPILE.call(
            abi.encodeWithSignature(
                "associateToken(address,address)",
                address(this),
                token
            )
        );
        if (!success) revert AssocFail();
        int64 rc = abi.decode(result, (int64));
        if (rc != HederaResponseCodes.SUCCESS && rc != int64(282)) revert AssocFail();
        emit TokenAssociated(token);
    }

    // ── Default Setters ─────────────────────────────────────
    function setDefaultAmount(uint256 _amount) external onlyOwner {
        if (_amount == 0) revert ZeroAmount();
        defaultAmount = _amount;
        emit DefaultsUpdated(_amount, defaultInterval);
    }

    function setDefaultInterval(uint256 _interval) external onlyOwner {
        if (_interval < MIN_INTERVAL) revert IntervalTooShort();
        defaultInterval = _interval;
        emit DefaultsUpdated(defaultAmount, _interval);
    }

    function setGasLimit(uint256 _gasLimit) external onlyOwner {
        if (_gasLimit < 400_000) revert GasLow();
        scheduledCallGasLimit = _gasLimit;
    }

    // ── Agent Management ────────────────────────────────────
    function addAgent(
        address payable agent,
        string calldata name,
        uint256 amountPerPeriod,
        uint256 intervalSeconds
    ) external onlyOwner returns (uint256 idx) {
        if (agent == address(0)) revert ZeroAddr();
        if (isAgent[agent]) revert AlreadyExists();
        if (agents.length >= MAX_AGENTS) revert MaxReached();

        // Use defaults if 0
        uint256 amount = amountPerPeriod > 0 ? amountPerPeriod : defaultAmount;
        uint256 interval = intervalSeconds > 0
            ? intervalSeconds
            : defaultInterval;
        if (interval < MIN_INTERVAL) revert IntervalTooShort();

        idx = agents.length;
        agents.push(
            AgentPayroll({
                agent: agent,
                amountPerPeriod: amount,
                intervalSeconds: interval,
                nextPaymentTime: 0,
                currentScheduleAddr: address(0),
                status: ScheduleStatus.None,
                totalPaid: 0,
                paymentCount: 0,
                active: true,
                agentName: name
            })
        );
        agentIndex[agent] = idx;
        isAgent[agent] = true;

        emit AgentAdded(idx, agent, name, amount, interval);
    }

    function removeAgent(uint256 idx) external onlyOwner {
        if (idx >= agents.length) revert Idx();
        AgentPayroll storage ap = agents[idx];
        if (!ap.active) revert NotActive();

        ap.active = false;
        isAgent[ap.agent] = false;

        emit AgentRemoved(idx, ap.agent);
    }

    function updateAgent(
        uint256 idx,
        uint256 newAmount,
        uint256 newInterval
    ) external onlyOwner {
        if (idx >= agents.length) revert Idx();
        AgentPayroll storage ap = agents[idx];
        if (!ap.active) revert NotActive();

        if (newAmount > 0) ap.amountPerPeriod = newAmount;
        if (newInterval > 0) {
            if (newInterval < MIN_INTERVAL) revert IntervalTooShort();
            ap.intervalSeconds = newInterval;
        }

        emit AgentUpdated(idx, ap.amountPerPeriod, ap.intervalSeconds);
    }

    // ── Schedule Initiation ─────────────────────────────────
    /// @notice Start the payroll schedule for an agent (creates first HSS schedule)
    function startPayroll(uint256 agentIdx) external onlyOwner {
        if (agentIdx >= agents.length) revert Idx();
        AgentPayroll storage ap = agents[agentIdx];
        if (!ap.active) revert NotActive();
        if (ap.status == ScheduleStatus.Pending) revert AlreadySched();

        uint256 nextTime = block.timestamp + ap.intervalSeconds;
        ap.nextPaymentTime = nextTime;

        _createSchedule(agentIdx, nextTime);
    }

    /// @notice Internal: create a scheduled call via HSS
    function _createSchedule(uint256 agentIdx, uint256 time) internal {
        AgentPayroll storage ap = agents[agentIdx];

        // Check contract has enough HBAR to cover gas for next scheduled call
        uint256 gasReserve = scheduledCallGasLimit * 87;
        if (address(this).balance < gasReserve) {
            ap.status = ScheduleStatus.Failed;
            emit PayrollFailed(agentIdx, "GAS");
            return;
        }

        // Check capacity, try time+1 if needed
        bool hasCapacity = _hasScheduleCapacity(time, scheduledCallGasLimit);
        if (!hasCapacity) {
            time += 1;
            hasCapacity = _hasScheduleCapacity(time, scheduledCallGasLimit);
            if (!hasCapacity) {
                ap.status = ScheduleStatus.Failed;
                emit ScheduleCapacityUnavailable(agentIdx, time);
                return;
            }
        }

        // Encode the future call to executePayroll(agentIdx)
        bytes memory callData = abi.encodeWithSelector(
            this.executePayroll.selector,
            agentIdx
        );

        // Call HSS system contract
        (int64 rc, address scheduleAddress) = _scheduleCall(
            address(this),
            time,
            scheduledCallGasLimit,
            0, // no HBAR in the scheduled tx itself
            callData
        );

        if (rc != HederaResponseCodes.SUCCESS) {
            ap.status = ScheduleStatus.Failed;
            emit PayrollFailed(agentIdx, "SCF");
            return;
        }

        ap.currentScheduleAddr = scheduleAddress;
        ap.status = ScheduleStatus.Pending;
        ap.nextPaymentTime = time;

        // Record in history
        uint256 histIdx = scheduleHistory.length;
        scheduleHistory.push(
            ScheduleRecord({
                agentIdx: agentIdx,
                scheduleAddress: scheduleAddress,
                scheduledTime: time,
                createdAt: block.timestamp,
                executedAt: 0,
                status: ScheduleStatus.Pending
            })
        );
        scheduleToHistoryIndex[scheduleAddress] = histIdx;

        emit ScheduleCreated(agentIdx, scheduleAddress, time);
    }

    // ── Payroll Execution (called by HSS) ───────────────────
    /// @notice Called by HSS at the scheduled time. Pays agent and reschedules.
    function executePayroll(uint256 agentIdx) external nonReentrant {
        if (msg.sender != address(this) && msg.sender != owner()) revert NotAuth();
        if (agentIdx >= agents.length) revert Idx();

        AgentPayroll storage ap = agents[agentIdx];

        // Skip if agent was deactivated
        if (!ap.active) {
            ap.status = ScheduleStatus.Failed;
            emit PayrollFailed(agentIdx, "OFF");
            return;
        }

        // Check balance & transfer (HBAR or token)
        bool transferOk;
        uint256 available;

        if (paymentToken == address(0)) {
            // HBAR mode
            available = address(this).balance;
            if (available < ap.amountPerPeriod) {
                ap.status = ScheduleStatus.Failed;
                emit InsufficientBalance(agentIdx, ap.amountPerPeriod, available);
                emit PayrollFailed(agentIdx, "BAL");
                return;
            }
            (transferOk, ) = ap.agent.call{value: ap.amountPerPeriod}("");
        } else {
            // ERC-20/HTS token mode
            available = IERC20(paymentToken).balanceOf(address(this));
            if (available < ap.amountPerPeriod) {
                ap.status = ScheduleStatus.Failed;
                emit InsufficientBalance(agentIdx, ap.amountPerPeriod, available);
                emit PayrollFailed(agentIdx, "BAL");
                return;
            }
            transferOk = IERC20(paymentToken).transfer(ap.agent, ap.amountPerPeriod);
        }

        if (!transferOk) {
            ap.status = ScheduleStatus.Failed;
            emit PayrollFailed(agentIdx, "XFER");
            return;
        }

        // Update state
        ap.paymentCount += 1;
        ap.totalPaid += ap.amountPerPeriod;
        ap.status = ScheduleStatus.Executed;

        // Update history record
        if (ap.currentScheduleAddr != address(0)) {
            uint256 histIdx = scheduleToHistoryIndex[ap.currentScheduleAddr];
            if (histIdx < scheduleHistory.length) {
                scheduleHistory[histIdx].status = ScheduleStatus.Executed;
                scheduleHistory[histIdx].executedAt = block.timestamp;
            }
        }

        emit PayrollExecuted(
            agentIdx,
            ap.agent,
            ap.amountPerPeriod,
            ap.paymentCount
        );

        // Self-reschedule next payment
        if (ap.active) {
            uint256 nextTime = block.timestamp + ap.intervalSeconds;
            ap.nextPaymentTime = nextTime;
            _createSchedule(agentIdx, nextTime);
        }
    }

    // ── Cancel Schedule ─────────────────────────────────────
    function cancelPayroll(uint256 agentIdx) external onlyOwner {
        if (agentIdx >= agents.length) revert Idx();
        AgentPayroll storage ap = agents[agentIdx];
        if (ap.status != ScheduleStatus.Pending) revert NoPending();

        address schedAddr = ap.currentScheduleAddr;

        // Attempt to delete from HSS (may fail if already executed)
        try this._tryDeleteSchedule(schedAddr) {} catch {}

        // Update history
        uint256 histIdx = scheduleToHistoryIndex[schedAddr];
        if (histIdx < scheduleHistory.length) {
            scheduleHistory[histIdx].status = ScheduleStatus.Cancelled;
        }

        ap.status = ScheduleStatus.Cancelled;
        ap.currentScheduleAddr = address(0);

        emit ScheduleCancelled(agentIdx, schedAddr);
    }

    /// @dev External wrapper so we can use try/catch
    function _tryDeleteSchedule(address schedAddr) external {
        if (msg.sender != address(this)) revert InternalOnly();
        _deleteSchedule(schedAddr);
    }

    // ── Retry After Failure ─────────────────────────────────
    function retryPayroll(uint256 agentIdx) external onlyOwner {
        if (agentIdx >= agents.length) revert Idx();
        AgentPayroll storage ap = agents[agentIdx];
        if (ap.status != ScheduleStatus.Failed && ap.status != ScheduleStatus.Cancelled) revert NoRetry();
        if (!ap.active) revert NotActive();

        uint256 nextTime = block.timestamp + ap.intervalSeconds;
        ap.nextPaymentTime = nextTime;
        _createSchedule(agentIdx, nextTime);
    }

    // ── View Functions (Observability) ──────────────────────
    function getAgentCount() external view returns (uint256) {
        return agents.length;
    }

    function getAgent(
        uint256 idx
    ) external view returns (AgentPayroll memory) {
        if (idx >= agents.length) revert Idx();
        return agents[idx];
    }

    function getAllAgents() external view returns (AgentPayroll[] memory) {
        return agents;
    }

    function getScheduleHistoryCount() external view returns (uint256) {
        return scheduleHistory.length;
    }

    function getScheduleRecord(
        uint256 idx
    ) external view returns (ScheduleRecord memory) {
        if (idx >= scheduleHistory.length) revert Idx();
        return scheduleHistory[idx];
    }

    function getRecentHistory(
        uint256 count
    ) external view returns (ScheduleRecord[] memory) {
        uint256 total = scheduleHistory.length;
        uint256 start = total > count ? total - count : 0;
        uint256 len = total - start;
        ScheduleRecord[] memory records = new ScheduleRecord[](len);
        for (uint256 i = 0; i < len; i++) {
            records[i] = scheduleHistory[start + i];
        }
        return records;
    }

    function getVaultBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Get token balance (0 if no payment token set)
    function getTokenBalance() external view returns (uint256) {
        if (paymentToken == address(0)) return 0;
        return IERC20(paymentToken).balanceOf(address(this));
    }

    // ╔═══════════════════════════════════════════════════════╗
    // ║  SUBSCRIPTION SYSTEM — Inbound Pull-Based Payments   ║
    // ║  Same HSS self-rescheduling, reversed direction       ║
    // ╚═══════════════════════════════════════════════════════╝

    // ── Subscription Enums & Structs ────────────────────────
    enum SubPaymentMode {
        HBAR,
        Token
    }

    struct Subscription {
        address subscriber;
        uint256 amountPerPeriod;
        uint256 intervalSeconds;
        uint256 nextPaymentTime;
        address currentScheduleAddr;
        ScheduleStatus status;
        uint256 totalPaid;
        uint256 paymentCount;
        bool active;
        string name;
        SubPaymentMode mode;
        address token; // address(0) for HBAR, token address for ERC-20
    }

    struct SubScheduleRecord {
        uint256 subIdx;
        address scheduleAddress;
        uint256 scheduledTime;
        uint256 createdAt;
        uint256 executedAt;
        ScheduleStatus status;
    }

    // ── Subscription State ──────────────────────────────────
    Subscription[] public subscriptions;
    mapping(address => uint256[]) public subscriberSubs;
    mapping(uint256 => uint256) public subHbarBalance; // subIdx → escrowed HBAR
    SubScheduleRecord[] public subScheduleHistory;
    mapping(address => uint256) public subScheduleToHistoryIndex;
    uint256 public collectedHbar;
    mapping(address => uint256) public collectedTokens;

    // ── Subscription Events ─────────────────────────────────
    event SubscriptionCreated(
        uint256 indexed subIdx, address indexed subscriber,
        string name, uint256 amount, uint256 interval,
        SubPaymentMode mode, address token
    );
    event SubscriptionCancelled(uint256 indexed subIdx, address indexed subscriber, uint256 refund);
    event SubscriptionUpdated(uint256 indexed subIdx, uint256 newAmount, uint256 newInterval);
    event HbarDeposited(uint256 indexed subIdx, address indexed subscriber, uint256 amount, uint256 newBalance);
    event HbarRefunded(uint256 indexed subIdx, address indexed subscriber, uint256 amount);
    event SubScheduleCreated(uint256 indexed subIdx, address indexed scheduleAddress, uint256 scheduledTime);
    event SubscriptionExecuted(uint256 indexed subIdx, address indexed subscriber, uint256 amount, uint256 paymentNumber);
    event SubscriptionFailed(uint256 indexed subIdx, string reason);
    event SubScheduleCancelled(uint256 indexed subIdx, address indexed scheduleAddress);
    event SubInsufficientBalance(uint256 indexed subIdx, uint256 required, uint256 available);
    event SubCapacityUnavailable(uint256 indexed subIdx, uint256 requestedTime);
    event RevenueWithdrawn(address indexed to, uint256 hbarAmount, address token, uint256 tokenAmount);

    // ── Subscribe HBAR ──────────────────────────────────────
    /// @notice Create an HBAR subscription. Send HBAR with the call as initial deposit.
    function subscribeHbar(
        string calldata name,
        uint256 amountPerPeriod,
        uint256 intervalSeconds
    ) external payable returns (uint256 idx) {
        if (amountPerPeriod == 0) revert ZeroAmount();
        if (intervalSeconds < MIN_INTERVAL) revert IntervalTooShort();
        if (msg.value < amountPerPeriod) revert InsufDeposit();
        if (subscriptions.length >= MAX_SUBSCRIPTIONS) revert MaxReached();

        idx = subscriptions.length;
        subscriptions.push(Subscription({
            subscriber: msg.sender,
            amountPerPeriod: amountPerPeriod,
            intervalSeconds: intervalSeconds,
            nextPaymentTime: 0,
            currentScheduleAddr: address(0),
            status: ScheduleStatus.None,
            totalPaid: 0,
            paymentCount: 0,
            active: true,
            name: name,
            mode: SubPaymentMode.HBAR,
            token: address(0)
        }));
        subscriberSubs[msg.sender].push(idx);
        subHbarBalance[idx] = msg.value;

        emit SubscriptionCreated(idx, msg.sender, name, amountPerPeriod, intervalSeconds, SubPaymentMode.HBAR, address(0));
        emit HbarDeposited(idx, msg.sender, msg.value, msg.value);
    }

    // ── Subscribe Token (ERC-20 / USDC) ─────────────────────
    /// @notice Create an ERC-20/USDC subscription. Caller must have approved this contract.
    function subscribeToken(
        address token,
        string calldata name,
        uint256 amountPerPeriod,
        uint256 intervalSeconds
    ) external returns (uint256 idx) {
        if (token == address(0)) revert UseHbar();
        if (amountPerPeriod == 0) revert ZeroAmount();
        if (intervalSeconds < MIN_INTERVAL) revert IntervalTooShort();
        if (subscriptions.length >= MAX_SUBSCRIPTIONS) revert MaxReached();
        if (IERC20(token).allowance(msg.sender, address(this)) < amountPerPeriod) revert ApproveFirst();

        idx = subscriptions.length;
        subscriptions.push(Subscription({
            subscriber: msg.sender,
            amountPerPeriod: amountPerPeriod,
            intervalSeconds: intervalSeconds,
            nextPaymentTime: 0,
            currentScheduleAddr: address(0),
            status: ScheduleStatus.None,
            totalPaid: 0,
            paymentCount: 0,
            active: true,
            name: name,
            mode: SubPaymentMode.Token,
            token: token
        }));
        subscriberSubs[msg.sender].push(idx);

        emit SubscriptionCreated(idx, msg.sender, name, amountPerPeriod, intervalSeconds, SubPaymentMode.Token, token);
    }

    // ── HBAR Top Up ─────────────────────────────────────────
    /// @notice Add more HBAR to an existing subscription's escrow
    function topUpSubscription(uint256 subIdx) external payable {
        if (subIdx >= subscriptions.length) revert Idx();
        Subscription storage sub = subscriptions[subIdx];
        if (!sub.active) revert NotActive();
        if (sub.mode != SubPaymentMode.HBAR) revert NotHbar();
        if (msg.value == 0) revert ZeroAmount();

        subHbarBalance[subIdx] += msg.value;
        emit HbarDeposited(subIdx, msg.sender, msg.value, subHbarBalance[subIdx]);
    }

    // ── Start Subscription Schedule ─────────────────────────
    /// @notice Start the subscription HSS loop (owner only)
    function startSubscription(uint256 subIdx) external onlyOwner {
        if (subIdx >= subscriptions.length) revert Idx();
        Subscription storage sub = subscriptions[subIdx];
        if (!sub.active) revert NotActive();
        if (sub.status == ScheduleStatus.Pending) revert AlreadySched();

        uint256 nextTime = block.timestamp + sub.intervalSeconds;
        sub.nextPaymentTime = nextTime;
        _createSubSchedule(subIdx, nextTime);
    }

    /// @notice Internal: create a subscription scheduled call via HSS
    function _createSubSchedule(uint256 subIdx, uint256 time) internal {
        Subscription storage sub = subscriptions[subIdx];

        // Check contract has enough HBAR to cover gas for next scheduled call
        // ~87 tinybar/gas at 870 gWei (Hedera charges full gasLimit, no refund for scheduled txs)
        uint256 gasReserve = scheduledCallGasLimit * 87;
        if (address(this).balance < gasReserve) {
            sub.status = ScheduleStatus.Failed;
            emit SubscriptionFailed(subIdx, "GAS");
            return;
        }

        bool hasCapacity = _hasScheduleCapacity(time, scheduledCallGasLimit);
        if (!hasCapacity) {
            time += 1;
            hasCapacity = _hasScheduleCapacity(time, scheduledCallGasLimit);
            if (!hasCapacity) {
                sub.status = ScheduleStatus.Failed;
                emit SubCapacityUnavailable(subIdx, time);
                return;
            }
        }

        bytes memory callData = abi.encodeWithSelector(
            this.executeSubscription.selector,
            subIdx
        );

        (int64 rc, address scheduleAddress) = _scheduleCall(
            address(this), time, scheduledCallGasLimit, 0, callData
        );

        if (rc != HederaResponseCodes.SUCCESS) {
            sub.status = ScheduleStatus.Failed;
            emit SubscriptionFailed(subIdx, "SCF");
            return;
        }

        sub.currentScheduleAddr = scheduleAddress;
        sub.status = ScheduleStatus.Pending;
        sub.nextPaymentTime = time;

        uint256 histIdx = subScheduleHistory.length;
        subScheduleHistory.push(SubScheduleRecord({
            subIdx: subIdx,
            scheduleAddress: scheduleAddress,
            scheduledTime: time,
            createdAt: block.timestamp,
            executedAt: 0,
            status: ScheduleStatus.Pending
        }));
        subScheduleToHistoryIndex[scheduleAddress] = histIdx;

        emit SubScheduleCreated(subIdx, scheduleAddress, time);
    }

    // ── Execute Subscription (called by HSS) ────────────────
    /// @notice Called by HSS at scheduled time. Pulls payment and self-reschedules.
    function executeSubscription(uint256 subIdx) external nonReentrant {
        if (msg.sender != address(this) && msg.sender != owner()) revert NotAuth();
        if (subIdx >= subscriptions.length) revert Idx();

        Subscription storage sub = subscriptions[subIdx];

        if (!sub.active) {
            sub.status = ScheduleStatus.Failed;
            emit SubscriptionFailed(subIdx, "OFF");
            return;
        }

        bool pullOk;

        if (sub.mode == SubPaymentMode.HBAR) {
            uint256 escrowed = subHbarBalance[subIdx];
            if (escrowed < sub.amountPerPeriod) {
                sub.status = ScheduleStatus.Failed;
                emit SubInsufficientBalance(subIdx, sub.amountPerPeriod, escrowed);
                emit SubscriptionFailed(subIdx, "BAL");
                return;
            }
            subHbarBalance[subIdx] -= sub.amountPerPeriod;
            collectedHbar += sub.amountPerPeriod;
            pullOk = true;
        } else {
            uint256 allowance = IERC20(sub.token).allowance(sub.subscriber, address(this));
            if (allowance < sub.amountPerPeriod) {
                sub.status = ScheduleStatus.Failed;
                emit SubInsufficientBalance(subIdx, sub.amountPerPeriod, allowance);
                emit SubscriptionFailed(subIdx, "ALW");
                return;
            }
            uint256 balance = IERC20(sub.token).balanceOf(sub.subscriber);
            if (balance < sub.amountPerPeriod) {
                sub.status = ScheduleStatus.Failed;
                emit SubInsufficientBalance(subIdx, sub.amountPerPeriod, balance);
                emit SubscriptionFailed(subIdx, "BAL");
                return;
            }
            pullOk = IERC20(sub.token).transferFrom(sub.subscriber, address(this), sub.amountPerPeriod);
        }

        if (!pullOk) {
            sub.status = ScheduleStatus.Failed;
            emit SubscriptionFailed(subIdx, "XFER");
            return;
        }

        sub.paymentCount += 1;
        sub.totalPaid += sub.amountPerPeriod;
        sub.status = ScheduleStatus.Executed;

        if (sub.currentScheduleAddr != address(0)) {
            uint256 histIdx = subScheduleToHistoryIndex[sub.currentScheduleAddr];
            if (histIdx < subScheduleHistory.length) {
                subScheduleHistory[histIdx].status = ScheduleStatus.Executed;
                subScheduleHistory[histIdx].executedAt = block.timestamp;
            }
        }

        emit SubscriptionExecuted(subIdx, sub.subscriber, sub.amountPerPeriod, sub.paymentCount);

        // Self-reschedule next pull
        if (sub.active) {
            uint256 nextTime = block.timestamp + sub.intervalSeconds;
            sub.nextPaymentTime = nextTime;
            _createSubSchedule(subIdx, nextTime);
        }
    }

    // ── Cancel Subscription ─────────────────────────────────
    /// @notice Cancel a subscription. Subscriber or owner can cancel. Refunds escrowed HBAR.
    function cancelSubscription(uint256 subIdx) external {
        if (subIdx >= subscriptions.length) revert Idx();
        Subscription storage sub = subscriptions[subIdx];
        if (!sub.active) revert AlreadyCancelled();
        if (msg.sender != sub.subscriber && msg.sender != owner()) revert NotAuth();

        sub.active = false;

        if (sub.status == ScheduleStatus.Pending && sub.currentScheduleAddr != address(0)) {
            address schedAddr = sub.currentScheduleAddr;
            try this._tryDeleteSchedule(schedAddr) {} catch {}
            uint256 histIdx = subScheduleToHistoryIndex[schedAddr];
            if (histIdx < subScheduleHistory.length) {
                subScheduleHistory[histIdx].status = ScheduleStatus.Cancelled;
            }
            emit SubScheduleCancelled(subIdx, schedAddr);
        }

        sub.status = ScheduleStatus.Cancelled;
        sub.currentScheduleAddr = address(0);

        uint256 refund = 0;
        if (sub.mode == SubPaymentMode.HBAR) {
            refund = subHbarBalance[subIdx];
            if (refund > 0) {
                subHbarBalance[subIdx] = 0;
                (bool sent, ) = payable(sub.subscriber).call{value: refund}("");
                if (!sent) revert XferFail();
                emit HbarRefunded(subIdx, sub.subscriber, refund);
            }
        }

        emit SubscriptionCancelled(subIdx, sub.subscriber, refund);
    }

    // ── Retry Subscription ──────────────────────────────────
    function retrySubscription(uint256 subIdx) external onlyOwner {
        if (subIdx >= subscriptions.length) revert Idx();
        Subscription storage sub = subscriptions[subIdx];
        if (sub.status != ScheduleStatus.Failed && sub.status != ScheduleStatus.Cancelled) revert NoRetry();
        if (!sub.active) revert NotActive();

        uint256 nextTime = block.timestamp + sub.intervalSeconds;
        sub.nextPaymentTime = nextTime;
        _createSubSchedule(subIdx, nextTime);
    }

    // ── Update Subscription ─────────────────────────────────
    function updateSubscription(uint256 subIdx, uint256 newAmount, uint256 newInterval) external {
        if (subIdx >= subscriptions.length) revert Idx();
        Subscription storage sub = subscriptions[subIdx];
        if (!sub.active) revert NotActive();
        if (msg.sender != sub.subscriber && msg.sender != owner()) revert NotAuth();

        if (newAmount > 0) sub.amountPerPeriod = newAmount;
        if (newInterval > 0) {
            if (newInterval < MIN_INTERVAL) revert IntervalTooShort();
            sub.intervalSeconds = newInterval;
        }
        emit SubscriptionUpdated(subIdx, sub.amountPerPeriod, sub.intervalSeconds);
    }

    // ── Revenue Withdrawal ──────────────────────────────────
    /// @notice Withdraw collected HBAR subscription revenue
    function withdrawSubHbar(uint256 amount) external onlyOwner {
        if (amount > collectedHbar) revert InsufBal();
        collectedHbar -= amount;
        (bool sent, ) = payable(owner()).call{value: amount}("");
        if (!sent) revert XferFail();
        emit RevenueWithdrawn(owner(), amount, address(0), 0);
    }

    /// @notice Withdraw collected ERC-20 token subscription revenue
    function withdrawSubTokens(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) revert UseHbar();
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (amount > bal) revert InsufBal();
        bool ok = IERC20(token).transfer(owner(), amount);
        if (!ok) revert XferFail();
        emit RevenueWithdrawn(owner(), 0, token, amount);
    }

    // ── Subscription View Functions ─────────────────────────
    function getSubscriptionCount() external view returns (uint256) {
        return subscriptions.length;
    }

    function getSubscription(uint256 idx) external view returns (Subscription memory) {
        if (idx >= subscriptions.length) revert Idx();
        return subscriptions[idx];
    }

    function getAllSubscriptions() external view returns (Subscription[] memory) {
        return subscriptions;
    }

    function getSubscriberSubs(address subscriber) external view returns (uint256[] memory) {
        return subscriberSubs[subscriber];
    }

    function getSubHbarBalance(uint256 subIdx) external view returns (uint256) {
        return subHbarBalance[subIdx];
    }

    function getCollectedHbar() external view returns (uint256) {
        return collectedHbar;
    }

    function getSubScheduleHistoryCount() external view returns (uint256) {
        return subScheduleHistory.length;
    }

    function getSubScheduleRecord(uint256 idx) external view returns (SubScheduleRecord memory) {
        if (idx >= subScheduleHistory.length) revert Idx();
        return subScheduleHistory[idx];
    }

    function getSubRecentHistory(uint256 count) external view returns (SubScheduleRecord[] memory) {
        uint256 total = subScheduleHistory.length;
        uint256 start = total > count ? total - count : 0;
        uint256 len = total - start;
        SubScheduleRecord[] memory records = new SubScheduleRecord[](len);
        for (uint256 i = 0; i < len; i++) {
            records[i] = subScheduleHistory[start + i];
        }
        return records;
    }

    function getSubTokenBalance(address token) external view returns (uint256) {
        if (token == address(0)) return 0;
        return IERC20(token).balanceOf(address(this));
    }
}
