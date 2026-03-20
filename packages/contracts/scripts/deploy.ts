import { ethers } from "hardhat";

// Sepolia USDT — official Tether deployment
const SEPOLIA_USDT = "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );

  console.log("\n--- Deploying PolicyDelegate ---");
  const PolicyDelegate = await ethers.getContractFactory("PolicyDelegate");
  const policyDelegate = await PolicyDelegate.deploy();
  await policyDelegate.waitForDeployment();
  const policyAddress = await policyDelegate.getAddress();
  console.log(`PolicyDelegate deployed to: ${policyAddress}`);

  const usdt = await ethers.getContractAt("IERC20", SEPOLIA_USDT);
  const usdtBalance = await usdt.balanceOf(deployer.address);
  console.log(
    `Deployer USDT balance: ${ethers.formatUnits(usdtBalance, 6)} USDT`
  );
  if (usdtBalance === 0n) {
    console.log("\nNo USDT! Get test USDT from a Sepolia faucet:");
    console.log("   https://developer.bitaps.com/faucet");
  }

  console.log("\nWaiting for block confirmations...");
  await policyDelegate.deploymentTransaction()?.wait(5);

  // Verify contract version
  const version = await policyDelegate.getVersion();
  console.log(`Contract version: ${version}`);

  console.log("\n=== WARDEN DEPLOYMENT COMPLETE ===");
  console.log("Add these to your .env:");
  console.log(`POLICY_DELEGATE_ADDRESS=${policyAddress}`);
  console.log(`SEPOLIA_USDT_ADDRESS=${SEPOLIA_USDT}`);
  console.log(`\nVerify on Etherscan:`);
  console.log(`npx hardhat verify --network sepolia ${policyAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
