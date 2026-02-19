// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {HederaScheduleService} from "./HederaScheduleService.sol";
import {HederaResponseCodes} from "./interfaces/HederaResponseCodes.sol";

/// @title SPARKPayrollVault — Automated HSS-powered payroll for AI agent rewards
/// @notice Uses Hedera Schedule Service (scheduleCall at 0x16b) to create self-rescheduling
///         payment loops. No off-chain servers required.
contract SPARKPayrollVault is Ownable, ReentrancyGuard, HederaScheduleService {
    // ── Constants ────────────────────────────────────────────
    uint256 public scheduledCallGasLimit = 10_000_000; // 10M gas — HSS precompile is expensive
    uint256 public constant MIN_INTERVAL = 10; // 10 seconds minimum (demo)
    uint256 public constant MAX_AGENTS = 50;

    // ── Configurable defaults (set at deploy time) ──────────
    uint256 public defaultAmount; // tinybar per period
    uint256 public defaultInterval; // seconds between payments

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
        uint256 amountPerPeriod; // tinybar
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
    event VaultWithdrawn(address indexed to, uint256 amount);

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
        require(_defaultAmount > 0, "Zero default amount");
        require(_defaultInterval >= MIN_INTERVAL, "Interval too short");
        defaultAmount = _defaultAmount;
        defaultInterval = _defaultInterval;
    }

    // ── Fund Management ─────────────────────────────────────
    receive() external payable {
        emit VaultFunded(msg.sender, msg.value, address(this).balance);
    }

    function fundVault() external payable {
        require(msg.value > 0, "Must send HBAR");
        emit VaultFunded(msg.sender, msg.value, address(this).balance);
    }

    function withdrawExcess(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");
        (bool sent, ) = payable(owner()).call{value: amount}("");
        require(sent, "Withdraw failed");
        emit VaultWithdrawn(owner(), amount);
    }

    // ── Default Setters ─────────────────────────────────────
    function setDefaultAmount(uint256 _amount) external onlyOwner {
        require(_amount > 0, "Zero amount");
        defaultAmount = _amount;
        emit DefaultsUpdated(_amount, defaultInterval);
    }

    function setDefaultInterval(uint256 _interval) external onlyOwner {
        require(_interval >= MIN_INTERVAL, "Interval too short");
        defaultInterval = _interval;
        emit DefaultsUpdated(defaultAmount, _interval);
    }

    function setGasLimit(uint256 _gasLimit) external onlyOwner {
        require(_gasLimit >= 1_000_000, "Gas too low");
        scheduledCallGasLimit = _gasLimit;
    }

    // ── Agent Management ────────────────────────────────────
    function addAgent(
        address payable agent,
        string calldata name,
        uint256 amountPerPeriod,
        uint256 intervalSeconds
    ) external onlyOwner returns (uint256 idx) {
        require(agent != address(0), "Zero address");
        require(!isAgent[agent], "Agent already exists");
        require(agents.length < MAX_AGENTS, "Max agents reached");

        // Use defaults if 0
        uint256 amount = amountPerPeriod > 0 ? amountPerPeriod : defaultAmount;
        uint256 interval = intervalSeconds > 0
            ? intervalSeconds
            : defaultInterval;
        require(interval >= MIN_INTERVAL, "Interval too short");

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
        require(idx < agents.length, "Invalid index");
        AgentPayroll storage ap = agents[idx];
        require(ap.active, "Already removed");

        ap.active = false;
        isAgent[ap.agent] = false;

        emit AgentRemoved(idx, ap.agent);
    }

    function updateAgent(
        uint256 idx,
        uint256 newAmount,
        uint256 newInterval
    ) external onlyOwner {
        require(idx < agents.length, "Invalid index");
        AgentPayroll storage ap = agents[idx];
        require(ap.active, "Agent not active");

        if (newAmount > 0) ap.amountPerPeriod = newAmount;
        if (newInterval > 0) {
            require(newInterval >= MIN_INTERVAL, "Interval too short");
            ap.intervalSeconds = newInterval;
        }

        emit AgentUpdated(idx, ap.amountPerPeriod, ap.intervalSeconds);
    }

    // ── Schedule Initiation ─────────────────────────────────
    /// @notice Start the payroll schedule for an agent (creates first HSS schedule)
    function startPayroll(uint256 agentIdx) external onlyOwner {
        require(agentIdx < agents.length, "Invalid index");
        AgentPayroll storage ap = agents[agentIdx];
        require(ap.active, "Agent not active");
        require(ap.status != ScheduleStatus.Pending, "Already scheduled");

        uint256 nextTime = block.timestamp + ap.intervalSeconds;
        ap.nextPaymentTime = nextTime;

        _createSchedule(agentIdx, nextTime);
    }

    /// @notice Internal: create a scheduled call via HSS
    function _createSchedule(uint256 agentIdx, uint256 time) internal {
        AgentPayroll storage ap = agents[agentIdx];

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
            emit PayrollFailed(agentIdx, "scheduleCall returned non-success");
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
        // When HSS executes this via scheduleCall targeting address(this),
        // msg.sender is address(this). Also allow owner for manual trigger.
        require(
            msg.sender == address(this) || msg.sender == owner(),
            "Not authorized"
        );
        require(agentIdx < agents.length, "Invalid index");

        AgentPayroll storage ap = agents[agentIdx];

        // Skip if agent was deactivated
        if (!ap.active) {
            ap.status = ScheduleStatus.Failed;
            emit PayrollFailed(agentIdx, "Agent deactivated");
            return;
        }

        // Check balance
        if (address(this).balance < ap.amountPerPeriod) {
            ap.status = ScheduleStatus.Failed;
            emit InsufficientBalance(
                agentIdx,
                ap.amountPerPeriod,
                address(this).balance
            );
            emit PayrollFailed(agentIdx, "Insufficient HBAR balance");
            return;
        }

        // Transfer HBAR to agent
        (bool sent, ) = ap.agent.call{value: ap.amountPerPeriod}("");
        if (!sent) {
            ap.status = ScheduleStatus.Failed;
            emit PayrollFailed(agentIdx, "HBAR transfer failed");
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
        require(agentIdx < agents.length, "Invalid index");
        AgentPayroll storage ap = agents[agentIdx];
        require(ap.status == ScheduleStatus.Pending, "No pending schedule");

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
        require(msg.sender == address(this), "Internal only");
        _deleteSchedule(schedAddr);
    }

    // ── Retry After Failure ─────────────────────────────────
    function retryPayroll(uint256 agentIdx) external onlyOwner {
        require(agentIdx < agents.length, "Invalid index");
        AgentPayroll storage ap = agents[agentIdx];
        require(
            ap.status == ScheduleStatus.Failed ||
                ap.status == ScheduleStatus.Cancelled,
            "Cannot retry"
        );
        require(ap.active, "Agent not active");

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
        require(idx < agents.length, "Invalid index");
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
        require(idx < scheduleHistory.length, "Invalid index");
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
}
