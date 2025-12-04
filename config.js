// config.js - THBC → KJC Auto Stake (BSC)

// BNB Smart Chain mainnet
const CHAIN_ID = 56;

// THBC token (BEP-20, 18 decimals)
const THBC_ADDRESS = "0xe8d4687b77B5611eF1828FDa7428034FA12a1Beb";

// THBCtoKJCStake contract
const STAKE_CONTRACT_ADDRESS = "0xc715253f8De35707Bd69bBE065FA561778cfA094";

// ---- Minimal ERC20 ABI ----
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

// ---- THBCtoKJCStake ABI (ย่อให้พอใช้กับ DApp) ----
// อิงจาก ABI เต็มที่คุณส่งมา (มี getStake / getStakeCount / swapAndStake ฯลฯ)
const STAKE_ABI = [
  "function rateKjcPerThbc() view returns (uint256)",
  "function apyBps() view returns (uint256)",
  "function lockDuration() view returns (uint256)",

  "function swapAndStake(uint256 thbcAmount) external",

  "function getStakeCount(address user) view returns (uint256)",
  "function getStake(address user, uint256 index) view returns (uint256 principal, uint256 reward, uint256 startTime, bool claimed)",
  "function pendingRewardAll(address user) view returns (uint256)"
];

window.THBC_KJC_CONFIG = {
  chainId: CHAIN_ID,
  thbc: {
    address: THBC_ADDRESS,
    abi: ERC20_ABI
  },
  stake: {
    address: STAKE_CONTRACT_ADDRESS,
    abi: STAKE_ABI
  }
};
