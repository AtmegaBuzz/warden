import { ethers } from "hardhat";

const SEPOLIA_USDT = "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06";

async function main() {
  const [deployer] = await ethers.getSigners();
  const agentAddresses = process.argv.slice(2);
  if (agentAddresses.length === 0) {
    console.log(
      "Usage: npx hardhat run scripts/fund-agents.ts --network sepolia -- 0xAgent1 0xAgent2"
    );
    return;
  }

  const usdt = await ethers.getContractAt("IERC20", SEPOLIA_USDT);
  const deployerBalance = await usdt.balanceOf(deployer.address);
  console.log(
    `Deployer USDT balance: ${ethers.formatUnits(deployerBalance, 6)} USDT`
  );

  const amountPerAgent = 100_000000n; // 100 USDT (6 decimals)

  for (const addr of agentAddresses) {
    console.log(`Sending 100 USDT to ${addr}...`);
    const tx = await usdt.transfer(addr, amountPerAgent);
    await tx.wait();
    const balance = await usdt.balanceOf(addr);
    console.log(`  Balance: ${ethers.formatUnits(balance, 6)} USDT`);
  }

  console.log("Done!");
}

main().catch(console.error);
