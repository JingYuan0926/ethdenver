import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("SPARKiNFTModule", (m) => {
  // Deploy MockVerifier first (always-pass oracle for hackathon demo)
  const mockVerifier = m.contract("MockVerifier");

  // Deploy SPARKiNFT with the MockVerifier address
  const sparkiNFT = m.contract("SPARKiNFT", [mockVerifier]);

  return { mockVerifier, sparkiNFT };
});
