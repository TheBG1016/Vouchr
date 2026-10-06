import { BrowserProvider } from "ethers";

export async function apiFetch(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export function postJson(url, body) {
  return apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function walletSignIn(intent, extra = {}) {
  if (!window.ethereum) throw new Error("Install MetaMask to continue.");
  let provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  if ((await provider.getNetwork()).chainId !== 11155111n) {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xaa36a7" }],
    });
    provider = new BrowserProvider(window.ethereum);
  }
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const { message } = await postJson("/api/auth/challenge", { address });
  const signature = await signer.signMessage(message);
  return postJson("/api/auth/verify", { message, signature, intent, ...extra });
}

export async function signOut() {
  return postJson("/api/auth/logout", {});
}
