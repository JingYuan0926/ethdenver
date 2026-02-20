// Subscription features are merged into SPARKPayrollVault — same contract, same address.
// This file exports the subscription-specific ABI subset for the subscription UI/API.
import { PAYROLL_VAULT_ADDRESS, HEDERA_RPC_URL, HASHSCAN_BASE } from "./payroll-vault-abi";

// Same deployed contract — subscription is just new functions on the same vault
export const SUBSCRIPTION_VAULT_ADDRESS = PAYROLL_VAULT_ADDRESS;

// Subscription-specific ABI (these functions live in SPARKPayrollVault alongside payroll)
export const SUBSCRIPTION_VAULT_ABI = [
  // Subscribe HBAR
  {"inputs":[{"internalType":"string","name":"name","type":"string"},{"internalType":"uint256","name":"amountPerPeriod","type":"uint256"},{"internalType":"uint256","name":"intervalSeconds","type":"uint256"}],"name":"subscribeHbar","outputs":[{"internalType":"uint256","name":"idx","type":"uint256"}],"stateMutability":"payable","type":"function"},
  // Subscribe Token (ERC-20 / USDC)
  {"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"string","name":"name","type":"string"},{"internalType":"uint256","name":"amountPerPeriod","type":"uint256"},{"internalType":"uint256","name":"intervalSeconds","type":"uint256"}],"name":"subscribeToken","outputs":[{"internalType":"uint256","name":"idx","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},
  // Top up HBAR escrow
  {"inputs":[{"internalType":"uint256","name":"subIdx","type":"uint256"}],"name":"topUpSubscription","outputs":[],"stateMutability":"payable","type":"function"},
  // Start schedule (owner)
  {"inputs":[{"internalType":"uint256","name":"subIdx","type":"uint256"}],"name":"startSubscription","outputs":[],"stateMutability":"nonpayable","type":"function"},
  // Execute (HSS callback)
  {"inputs":[{"internalType":"uint256","name":"subIdx","type":"uint256"}],"name":"executeSubscription","outputs":[],"stateMutability":"nonpayable","type":"function"},
  // Cancel
  {"inputs":[{"internalType":"uint256","name":"subIdx","type":"uint256"}],"name":"cancelSubscription","outputs":[],"stateMutability":"nonpayable","type":"function"},
  // Retry
  {"inputs":[{"internalType":"uint256","name":"subIdx","type":"uint256"}],"name":"retrySubscription","outputs":[],"stateMutability":"nonpayable","type":"function"},
  // Update
  {"inputs":[{"internalType":"uint256","name":"subIdx","type":"uint256"},{"internalType":"uint256","name":"newAmount","type":"uint256"},{"internalType":"uint256","name":"newInterval","type":"uint256"}],"name":"updateSubscription","outputs":[],"stateMutability":"nonpayable","type":"function"},
  // Token association (shared with payroll)
  {"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"associateToken","outputs":[],"stateMutability":"nonpayable","type":"function"},
  // Withdraw subscription revenue
  {"inputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"withdrawSubHbar","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"withdrawSubTokens","outputs":[],"stateMutability":"nonpayable","type":"function"},
  // Config (shared)
  {"inputs":[{"internalType":"uint256","name":"_gasLimit","type":"uint256"}],"name":"setGasLimit","outputs":[],"stateMutability":"nonpayable","type":"function"},
  // Internal helper (shared)
  {"inputs":[{"internalType":"address","name":"schedAddr","type":"address"}],"name":"_tryDeleteSchedule","outputs":[],"stateMutability":"nonpayable","type":"function"},
  // Subscription view functions
  {"inputs":[],"name":"getSubscriptionCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"idx","type":"uint256"}],"name":"getSubscription","outputs":[{"components":[{"internalType":"address","name":"subscriber","type":"address"},{"internalType":"uint256","name":"amountPerPeriod","type":"uint256"},{"internalType":"uint256","name":"intervalSeconds","type":"uint256"},{"internalType":"uint256","name":"nextPaymentTime","type":"uint256"},{"internalType":"address","name":"currentScheduleAddr","type":"address"},{"internalType":"uint8","name":"status","type":"uint8"},{"internalType":"uint256","name":"totalPaid","type":"uint256"},{"internalType":"uint256","name":"paymentCount","type":"uint256"},{"internalType":"bool","name":"active","type":"bool"},{"internalType":"string","name":"name","type":"string"},{"internalType":"uint8","name":"mode","type":"uint8"},{"internalType":"address","name":"token","type":"address"}],"internalType":"struct SPARKPayrollVault.Subscription","name":"","type":"tuple"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"getAllSubscriptions","outputs":[{"components":[{"internalType":"address","name":"subscriber","type":"address"},{"internalType":"uint256","name":"amountPerPeriod","type":"uint256"},{"internalType":"uint256","name":"intervalSeconds","type":"uint256"},{"internalType":"uint256","name":"nextPaymentTime","type":"uint256"},{"internalType":"address","name":"currentScheduleAddr","type":"address"},{"internalType":"uint8","name":"status","type":"uint8"},{"internalType":"uint256","name":"totalPaid","type":"uint256"},{"internalType":"uint256","name":"paymentCount","type":"uint256"},{"internalType":"bool","name":"active","type":"bool"},{"internalType":"string","name":"name","type":"string"},{"internalType":"uint8","name":"mode","type":"uint8"},{"internalType":"address","name":"token","type":"address"}],"internalType":"struct SPARKPayrollVault.Subscription[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"subscriber","type":"address"}],"name":"getSubscriberSubs","outputs":[{"internalType":"uint256[]","name":"","type":"uint256[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"subIdx","type":"uint256"}],"name":"getSubHbarBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"getCollectedHbar","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"getSubScheduleHistoryCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"idx","type":"uint256"}],"name":"getSubScheduleRecord","outputs":[{"components":[{"internalType":"uint256","name":"subIdx","type":"uint256"},{"internalType":"address","name":"scheduleAddress","type":"address"},{"internalType":"uint256","name":"scheduledTime","type":"uint256"},{"internalType":"uint256","name":"createdAt","type":"uint256"},{"internalType":"uint256","name":"executedAt","type":"uint256"},{"internalType":"uint8","name":"status","type":"uint8"}],"internalType":"struct SPARKPayrollVault.SubScheduleRecord","name":"","type":"tuple"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"count","type":"uint256"}],"name":"getSubRecentHistory","outputs":[{"components":[{"internalType":"uint256","name":"subIdx","type":"uint256"},{"internalType":"address","name":"scheduleAddress","type":"address"},{"internalType":"uint256","name":"scheduledTime","type":"uint256"},{"internalType":"uint256","name":"createdAt","type":"uint256"},{"internalType":"uint256","name":"executedAt","type":"uint256"},{"internalType":"uint8","name":"status","type":"uint8"}],"internalType":"struct SPARKPayrollVault.SubScheduleRecord[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"getSubTokenBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  // Shared
  {"inputs":[],"name":"getVaultBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"MAX_SUBSCRIPTIONS","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"MIN_INTERVAL","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"scheduledCallGasLimit","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"collectedHbar","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"stateMutability":"payable","type":"receive"}
] as const;

// Schedule status enum matching Solidity
export const SubscriptionScheduleStatus = {
  0: "None",
  1: "Pending",
  2: "Executed",
  3: "Failed",
  4: "Cancelled",
} as const;

// Payment mode enum matching Solidity
export const PaymentMode = {
  0: "HBAR",
  1: "Token",
} as const;

// Re-export shared config
export { HEDERA_RPC_URL, HASHSCAN_BASE } from "./payroll-vault-abi";
