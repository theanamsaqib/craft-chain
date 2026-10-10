const { expect } = require("chai");        // chai = the library that checks "this should equal that"
const { ethers } = require("hardhat");     // ethers = talks to the (fake, local) blockchain

describe("CraftBatch721", () => {

  // SETUP: runs before each test. Deploys a fresh contract and makes 4 fake people.
  async function setup() {
    const [admin, artisan, coop, buyer] = await ethers.getSigners(); // 4 fake wallets
    const Factory = await ethers.getContractFactory("CraftBatch721");
    const c = await Factory.deploy();                                 // deploy the contract

    // Admin (the deployer) gives the artisan permission to mint
    await c.grantRole(await c.MINTER_ROLE(), artisan.address);
    return { c, admin, artisan, coop, buyer };
  }

  // TEST 1: someone WITHOUT the minter role must NOT be able to mint
  it("only minters can mint", async () => {
    const { c, coop } = await setup();
    await expect(c.connect(coop).mintBatch("ipfs://x")).to.be.reverted;
  });

  // TEST 2: the artisan mints, and the NFT + metadata link are stored correctly
  it("artisan can mint and owns the batch", async () => {
    const { c, artisan } = await setup();
    await c.connect(artisan).mintBatch("ipfs://meta1");
    expect(await c.ownerOf(1)).to.equal(artisan.address);   // artisan owns token #1
    expect(await c.tokenURI(1)).to.equal("ipfs://meta1");   // metadata link saved
  });

  // TEST 3: the whole supply-chain flow: mint -> record step -> transfer -> next owner records step
  it("full flow: mint, record, transfer, record again", async () => {
    const { c, artisan, coop } = await setup();
    await c.connect(artisan).mintBatch("ipfs://meta1");

    // a fake "fingerprint" of the step data
    const hash = ethers.keccak256(ethers.toUtf8Bytes("{}"));

    // The owner (artisan) records a step -> should emit StepRecorded
    await expect(c.connect(artisan).recordStep(1, "PROCESSING", "ipfs://s1", hash))
      .to.emit(c, "StepRecorded");

    // Artisan hands custody to the co-op using the standard NFT transfer
    await c.connect(artisan).transferFrom(artisan.address, coop.address, 1);
    expect(await c.ownerOf(1)).to.equal(coop.address);

    // The old owner can NO LONGER record steps
    await expect(c.connect(artisan).recordStep(1, "X", "c", hash))
      .to.be.revertedWith("Not batch owner");

    // The new owner (co-op) CAN record steps
    await expect(c.connect(coop).recordStep(1, "TRANSPORT", "ipfs://s2", hash))
      .to.emit(c, "StepRecorded");
  });
});