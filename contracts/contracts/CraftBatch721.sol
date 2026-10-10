// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;


// ---------- IMPORTS: ready-made, audited code from OpenZeppelin ----------

// ERC721 = the standard NFT blueprint. Each token has a unique ID and one owner.
// Transferring the token = handing over custody of the batch.
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

// Lets each token store its own metadata link (our IPFS JSON: origin, material, dates).
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

// Lets us create roles (like MINTER) so only approved addresses can do certain things.
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title CraftBatch721
/// @notice Each craft batch is one NFT. Whoever holds the NFT has custody of the batch.
contract CraftBatch721 is ERC721URIStorage, AccessControl {

    // The "name tag" for the minter role. Only addresses holding this role
    // (artisans/producers) are allowed to create new batches.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // Counter for batch IDs. Starts at 1, goes up by 1 for every new batch.
    // "private" = only this contract can use it directly.
    uint256 private _nextTokenId = 1;

    // EVENT: a public log entry written to the blockchain when a batch is created.
    // The website reads these logs to show history. "indexed" makes them searchable.
    event BatchMinted(uint256 indexed tokenId, address indexed producer, string tokenURI);

    // EVENT: a public log entry for every step in a batch's life
    // (e.g. processing, transport, quality check).
    // The website reads these logs to build the timeline.
    event StepRecorded(
        uint256 indexed tokenId,   // which batch this step belongs to
        address indexed actor,     // who recorded it (always msg.sender)
        string stepType,           // e.g. "PROCESSING", "TRANSPORT"
        string cid,                // IPFS link to the step's details JSON
        bytes32 dataHash,          // fingerprint (keccak256 hash) of that JSON, to prove it wasn't changed
        uint64 timestamp           // when it was recorded
    );

    // CONSTRUCTOR: runs ONCE, at the moment the contract is deployed.
    // - Names the NFT collection "CraftBatch" with symbol "CRAFT".
    // - Gives the deployer (msg.sender = you) the admin role (can add/remove minters).
    // - Gives the deployer the minter role (can create batches).
    constructor() ERC721("CraftBatch", "CRAFT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    // MINT A BATCH (Artisan step in the flow: Mint batch -> Record steps -> Transfer)
    // - "external": called from outside (our website through MetaMask).
    // - "onlyRole(MINTER_ROLE)": the call is rejected unless the caller is an approved minter.
    // - "uri": the IPFS link to the batch's metadata JSON, e.g. "ipfs://Qm...".
    // - Returns the new batch's token ID.
    function mintBatch(string calldata uri) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        tokenId = _nextTokenId++;            // use the current number as the ID, then add 1 for next time
        _safeMint(msg.sender, tokenId);      // create the NFT and give it to the caller (the artisan)
        _setTokenURI(tokenId, uri);          // attach the metadata link to this batch
        emit BatchMinted(tokenId, msg.sender, uri); // write the "batch created" log
    }

    // RECORD A STEP (Co-op / Distributor / Retailer step in the flow)
    // Only the CURRENT OWNER of the batch can add a step.
    // So after the artisan transfers the NFT to the co-op, only the co-op can add steps.
    function recordStep(
        uint256 tokenId,
        string calldata stepType,
        string calldata cid,
        bytes32 dataHash
    ) external {
        // Check the caller owns this batch. If not, stop and show this error message.
        require(ownerOf(tokenId) == msg.sender, "Not batch owner");

        // Write the log. actor = msg.sender, as your PDF requires.
        // block.timestamp = the current time on the blockchain.
        emit StepRecorded(tokenId, msg.sender, stepType, cid, dataHash, uint64(block.timestamp));
    }

    // ---------- REQUIRED OVERRIDES (boilerplate) ----------
    // We combined two OpenZeppelin parts, and both define these two functions.
    // Solidity forces us to say how to combine them. We just use the parents' versions.

    // Returns the metadata link for a batch (what the website uses to fetch the IPFS data).
    function tokenURI(uint256 tokenId) public view override(ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    // Lets other apps (wallets, marketplaces) ask "does this contract support feature X?"
    function supportsInterface(bytes4 interfaceId) public view override(ERC721URIStorage, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}