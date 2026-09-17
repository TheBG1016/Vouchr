// scripts/deploy.js
//
// Deploys BlockchainPKI and writes the address + ABI where your frontend
// can find them.
//
//   Local dry run:  npx hardhat run scripts/deploy.js --network localhost
//   Real thing:     npx hardhat run scripts/deploy.js --network sepolia

const hre  = require("hardhat");
const fs   = require("fs");
const path = require("path");

async function main() {

  // ── 1. Who is deploying, and can they afford it? ───────────────────
  const [deployer] = await hre.ethers.getSigners();
  const network    = await hre.ethers.provider.getNetwork();
  const balance    = await hre.ethers.provider.getBalance(deployer.address);

  console.log("\nDeploying BlockchainPKI...");
  console.log("Deployer:", deployer.address);
  console.log("Balance: ", hre.ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    throw new Error(
      "This account has no ETH. Fund it from a Sepolia faucet (Step 2.3), " +
      "or deploy to --network localhost instead."
    );
  }

  // ── 2. Deploy ──────────────────────────────────────────────────────
  const Factory = await hre.ethers.getContractFactory("BlockchainPKI");
  const pki     = await Factory.deploy();

  console.log("\nWaiting for the transaction to be mined...");
  await pki.waitForDeployment();

  const address = await pki.getAddress();
  const txHash  = pki.deploymentTransaction().hash;

  console.log("\n✓ BlockchainPKI deployed to:", address);
  console.log("\n  Network:    ", network.name, `(chainId ${network.chainId})`);
  console.log("  Transaction:", txHash);

  if (network.chainId === 11155111n) {
    console.log("  Etherscan:   https://sepolia.etherscan.io/address/" + address);
  }

  // ── 3. Hand the address and ABI to the frontend ────────────────────
  // This saves you copying the ABI out of the artifacts folder by hand.
  const artifact = await hre.artifacts.readArtifact("BlockchainPKI");
  const outDir   = path.join(__dirname, "..", "frontend");

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, "contract-address.json"),
    JSON.stringify({
      address,
      chainId:    network.chainId.toString(),
      network:    network.name,
      deployedAt: new Date().toISOString(),
      txHash
    }, null, 2)
  );

  fs.writeFileSync(
    path.join(outDir, "BlockchainPKI-abi.json"),
    JSON.stringify(artifact.abi, null, 2)
  );

  console.log("\n✓ Wrote frontend/contract-address.json");
  console.log("✓ Wrote frontend/BlockchainPKI-abi.json");

  // ── 4. Tell the human what to do next ──────────────────────────────
  console.log("\n─────────────────────────────────────────────────────");
  console.log("NEXT STEP — paste this into frontend/dashboard.html:");
  console.log(`\n  const CONTRACT_ADDRESS = "${address}";\n`);
  console.log("─────────────────────────────────────────────────────\n");

  // Waiting a few blocks before Etherscan verification avoids a race where
  // Etherscan hasn't indexed the contract yet.
  if (network.chainId === 11155111n && process.env.ETHERSCAN_API_KEY) {
    console.log("Waiting 5 blocks before Etherscan verification...");
    await pki.deploymentTransaction().wait(5);
    try {
      await hre.run("verify:verify", { address, constructorArguments: [] });
      console.log("✓ Source verified on Etherscan");
    } catch (e) {
      console.log("Etherscan verification skipped:", e.message);
      console.log("You can run it manually later:");
      console.log(`  npx hardhat verify --network sepolia ${address}`);
    }
  }
}

main().catch((error) => {
  console.error("\n✗ Deployment failed:\n");
  console.error(error);
  process.exitCode = 1;
});
