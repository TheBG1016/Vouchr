export const CHAIN_ID = 11155111;
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0x933958160a0fFb81daf4C5F10cabc08bbd1718FF").toLowerCase();
export const ADMIN_ADDRESS = (process.env.ADMIN_WALLET_ADDRESS ||
  "0x9f0934eB73Fc3cc1436EAC1EC9d51aeD1883472E").toLowerCase();
export const RPC_URL = process.env.SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
