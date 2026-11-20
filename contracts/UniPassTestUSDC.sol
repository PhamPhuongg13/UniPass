// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Testnet-only token for UniPass programs. It has no monetary value.
contract UniPassTestUSDC is ERC20, Ownable2Step {
    constructor(address initialOwner) ERC20("UniPass Test USDC", "tUSDC") Ownable(initialOwner) {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external onlyOwner { _mint(to, amount); }
}
