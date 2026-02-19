import { network } from "hardhat";

const networkName = process.argv[2] || "zgTestnet";

const { ethers } = await network.connect({
  network: networkName,
  chainType: "l1",
});

const [deployer] = await ethers.getSigners();
console.log("Deploying with account:", deployer.address);

// Deploy MockVerifier
console.log("\n📝 Deploying MockVerifier...");
const MockVerifier = await ethers.getContractFactory("MockVerifier");
const verifier = await MockVerifier.deploy();
await verifier.waitForDeployment();
const verifierAddr = await verifier.getAddress();
console.log("✅ MockVerifier deployed to:", verifierAddr);

// Deploy SPARKiNFT
console.log("\n📝 Deploying SPARKiNFT...");
const SPARKiNFT = await ethers.getContractFactory("SPARKiNFT");
const inft = await SPARKiNFT.deploy(verifierAddr);
await inft.waitForDeployment();
const inftAddr = await inft.getAddress();
console.log("✅ SPARKiNFT deployed to:", inftAddr);

console.log("\n--- Copy these to ../lib/sparkinft-abi.ts ---");
console.log(`MOCK_VERIFIER_ADDRESS = "${verifierAddr}"`);
console.log(`SPARKINFT_ADDRESS     = "${inftAddr}"`);
