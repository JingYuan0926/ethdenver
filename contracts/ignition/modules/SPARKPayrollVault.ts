import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("SPARKPayrollVaultModule", (m) => {
  // Default: 1 HBAR (100_000_000 tinybar) per period, 60 second intervals
  const defaultAmount = m.getParameter(
    "defaultAmount",
    100_000_000n // 1 HBAR in tinybar
  );
  const defaultInterval = m.getParameter(
    "defaultInterval",
    60n // 60 seconds for demo
  );

  const vault = m.contract("SPARKPayrollVault", [
    defaultAmount,
    defaultInterval,
  ]);

  return { vault };
});
