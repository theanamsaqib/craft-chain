const { ethers, network, artifacts } = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await ethers.getSigners();   // the wallet from your .env
  console.log("Deploying with:", deployer.address, "on", network.name);

  // Send the contract to the blockchain
  const Factory = await ethers.getContractFactory("CraftBatch721");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();             // wait until it's confirmed

  const address = await contract.getAddress();
  const deployBlock = (await contract.deploymentTransaction().wait()).blockNumber;
  console.log("CraftBatch721 deployed to:", address);
  console.log("Deployed at block:", deployBlock);

  // Save address + ABI (the contract's "instruction manual") for the website
  const artifact = await artifacts.readArtifact("CraftBatch721");
  fs.writeFileSync(
    "deployed.json",
    JSON.stringify({ address, deployBlock, abi: artifact.abi }, null, 2)
  );
  console.log("Saved deployed.json");
}

main().catch((e) => { console.error(e); process.exit(1); });