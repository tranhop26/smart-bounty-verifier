function isProvider(value) {
  return Boolean(value && typeof value.request === "function");
}

function addProvider(candidates, provider) {
  if (isProvider(provider) && !candidates.includes(provider)) {
    candidates.push(provider);
  }
}

function errorCode(error) {
  return Number(error?.code ?? error?.data?.originalError?.code);
}

function isUnknownChainError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    errorCode(error) === 4902 ||
    message.includes("unrecognized chain") ||
    message.includes("unknown chain") ||
    message.includes("not added")
  );
}

export async function discoverInjectedProvider({
  ethereum = globalThis.window?.ethereum,
  eventTarget = globalThis.window,
  announcementWindowMs = 150,
} = {}) {
  const candidates = [];

  addProvider(candidates, ethereum);
  for (const provider of ethereum?.providers || []) {
    addProvider(candidates, provider);
  }

  if (eventTarget?.addEventListener && eventTarget?.dispatchEvent) {
    const onAnnounce = (event) => addProvider(candidates, event.detail?.provider);
    eventTarget.addEventListener("eip6963:announceProvider", onAnnounce);
    try {
      eventTarget.dispatchEvent(new Event("eip6963:requestProvider"));
      await new Promise((resolve) => setTimeout(resolve, announcementWindowMs));
    } finally {
      eventTarget.removeEventListener?.("eip6963:announceProvider", onAnnounce);
    }
  }

  return candidates[0] || null;
}

export async function requestWalletAccount(provider) {
  if (!isProvider(provider)) {
    throw new Error("No standard EIP-1193 browser wallet was detected.");
  }

  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const account = String(accounts?.[0] || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(account)) {
    throw new Error("The wallet did not return a valid account.");
  }
  return account;
}

export async function prepareProviderNetwork(provider, network) {
  if (!isProvider(provider)) {
    throw new Error("No standard EIP-1193 browser wallet was detected.");
  }

  const { chain } = network;
  const chainId = `0x${chain.id.toString(16)}`;
  const activeChainId = await provider.request({ method: "eth_chainId" });
  if (String(activeChainId).toLowerCase() === chainId.toLowerCase()) return;

  const chainParams = {
    chainId,
    chainName: chain.name,
    rpcUrls: [...chain.rpcUrls.default.http],
    nativeCurrency: chain.nativeCurrency,
    blockExplorerUrls: network.explorer ? [network.explorer] : [],
  };

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (error) {
    if (!isUnknownChainError(error)) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [chainParams],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  }
}

export function subscribeProvider(provider, {
  onAccountsChanged,
  onChainChanged,
} = {}) {
  if (typeof provider?.on !== "function") return () => {};

  if (typeof onAccountsChanged === "function") {
    provider.on("accountsChanged", onAccountsChanged);
  }
  if (typeof onChainChanged === "function") {
    provider.on("chainChanged", onChainChanged);
  }

  return () => {
    if (typeof provider.removeListener !== "function") return;
    if (typeof onAccountsChanged === "function") {
      provider.removeListener("accountsChanged", onAccountsChanged);
    }
    if (typeof onChainChanged === "function") {
      provider.removeListener("chainChanged", onChainChanged);
    }
  };
}

export async function connectInjectedWallet({
  ethereum = globalThis.window?.ethereum,
  eventTarget = globalThis.window,
  network,
  createWalletClient,
} = {}) {
  const provider = await discoverInjectedProvider({ ethereum, eventTarget });
  if (!provider) {
    throw new Error("No standard EIP-1193 browser wallet was detected.");
  }
  if (!network?.chain || typeof createWalletClient !== "function") {
    throw new Error("Wallet connection is not configured for the selected network.");
  }

  const account = await requestWalletAccount(provider);
  await prepareProviderNetwork(provider, network);
  const client = createWalletClient({
    chain: network.chain,
    account,
    provider,
  });
  return { provider, account, client };
}
