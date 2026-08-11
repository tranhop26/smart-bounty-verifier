import { createClient } from "genlayer-js";
import {
  localnet,
  studionet,
  testnetAsimov,
  testnetBradbury,
} from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { assertSuccessfulExecution } from "./receipt-proof.js";
import {
  connectInjectedWallet,
  subscribeProvider,
} from "./wallet-provider.js";
import reviewedContractSource from "../contracts/smart_bounty_verifier.py?raw";

const NETWORKS = {
  studionet: {
    key: "studionet",
    label: "Studionet",
    chain: studionet,
    explorer: "https://explorer-studio.genlayer.com",
  },
  testnetBradbury: {
    key: "testnetBradbury",
    label: "Testnet Bradbury",
    chain: testnetBradbury,
    explorer: "https://explorer-bradbury.genlayer.com",
  },
  testnetAsimov: {
    key: "testnetAsimov",
    label: "Testnet Asimov",
    chain: testnetAsimov,
    explorer: "https://explorer-asimov.genlayer.com",
  },
  localnet: {
    key: "localnet",
    label: "Localnet",
    chain: localnet,
    explorer: "",
  },
};

const DEPLOYMENTS = {
  studionet:
    import.meta.env.VITE_STUDIONET_CONTRACT_ADDRESS ||
    "0x1eF77713442c7BFC1eE4e91D643B6e780C8FAB84",
  testnetBradbury: import.meta.env.VITE_BRADBURY_CONTRACT_ADDRESS || "",
  testnetAsimov: import.meta.env.VITE_ASIMOV_CONTRACT_ADDRESS || "",
  localnet: import.meta.env.VITE_LOCALNET_CONTRACT_ADDRESS || "",
};

const REQUIRED_METHODS = [
  "create_bounty",
  "submit",
  "verify",
  "get_bounty",
  "get_all_bounties",
  "get_stats",
];

const state = {
  networkKey: "studionet",
  contractAddress: "",
  readClient: null,
  writeClient: null,
  walletProvider: null,
  walletUnsubscribe: null,
  walletAddress: "",
  readConnected: false,
  sourceMatch: false,
  reviewedSourceHash: "",
  deployedSourceHash: "",
  bounties: [],
  stats: null,
  busy: false,
};

const refs = {
  network: document.querySelector("#network"),
  contractAddress: document.querySelector("#contract-address"),
  connectReads: document.querySelector("#connect-reads"),
  connectWallet: document.querySelector("#connect-wallet"),
  refreshState: document.querySelector("#refresh-state"),
  connectionStatus: document.querySelector("#connection-status"),
  networkLabel: document.querySelector("#network-label"),
  contractLabel: document.querySelector("#contract-label"),
  walletLabel: document.querySelector("#wallet-label"),
  buildPosture: document.querySelector("#build-posture"),
  bountyList: document.querySelector("#bounty-list"),
  stats: {
    total: document.querySelector("#stat-total"),
    open: document.querySelector("#stat-open"),
    submitted: document.querySelector("#stat-submitted"),
    verified: document.querySelector("#stat-verified"),
    rejected: document.querySelector("#stat-rejected"),
    inconclusive: document.querySelector("#stat-inconclusive"),
  },
  tabs: Array.from(document.querySelectorAll('[role="tab"]')),
  panels: Array.from(document.querySelectorAll('[role="tabpanel"]')),
  createForm: document.querySelector("#create-form"),
  submitForm: document.querySelector("#submit-form"),
  verifyForm: document.querySelector("#verify-form"),
  inspectForm: document.querySelector("#inspect-form"),
  inspectOutput: document.querySelector("#inspect-output"),
  threshold: document.querySelector("#create-threshold"),
  thresholdOutput: document.querySelector("#threshold-output"),
  transactionTitle: document.querySelector("#transaction-title"),
  transactionState: document.querySelector("#transaction-state"),
  transactionSteps: Array.from(document.querySelectorAll("#transaction-steps li")),
  transactionResult: document.querySelector("#transaction-result"),
};

const actionButtons = [
  refs.createForm.querySelector('button[type="submit"]'),
  refs.submitForm.querySelector('button[type="submit"]'),
  refs.verifyForm.querySelector('button[type="submit"]'),
];
const inspectButton = refs.inspectForm.querySelector('button[type="submit"]');

function currentNetwork() {
  return NETWORKS[state.networkKey];
}

function shortHex(value, left = 6, right = 4) {
  if (!value) return "";
  if (value.length <= left + right + 3) return value;
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

function normalizeSource(value) {
  return String(value || "").replace(/\r\n/g, "\n").trimEnd();
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeJson(raw, label) {
  if (typeof raw !== "string") {
    throw new Error(`${label} returned an unexpected value.`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
}

function assertContractAddress(value) {
  const address = String(value || "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error("Enter a valid 20-byte contract address.");
  }
  return address;
}

function assertBountyId(value) {
  const id = String(value || "").trim();
  if (!/^(0|[1-9][0-9]*)$/.test(id)) {
    throw new Error("Bounty ID must be a non-negative integer.");
  }
  return id;
}

function assertGitHubUrl(value, { immutable = false } = {}) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    throw new Error("Enter a valid GitHub evidence URL.");
  }
  const allowedHosts = new Set(["github.com", "raw.githubusercontent.com"]);
  if (parsed.protocol !== "https:" || !allowedHosts.has(parsed.hostname)) {
    throw new Error("Evidence must use HTTPS on an approved GitHub host.");
  }
  if (parsed.username || parsed.password || parsed.port || parsed.hash) {
    throw new Error("Evidence URL cannot include credentials, a custom port, or a fragment.");
  }
  if (immutable && !/[0-9a-fA-F]{40}/.test(parsed.pathname)) {
    throw new Error("Submission URL must contain a full 40-character commit hash.");
  }
  return parsed.toString();
}

function textNode(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

function clearNode(node) {
  node.replaceChildren();
}

function setConnectionStatus(tone, title, detail) {
  refs.connectionStatus.dataset.state = tone;
  const copy = refs.connectionStatus.querySelector("div");
  copy.replaceChildren(
    textNode("strong", "", title),
    textNode("span", "", detail),
  );
  updateConnectionMeta();
}

function updateConnectionMeta() {
  refs.networkLabel.textContent = currentNetwork().label;
  refs.contractLabel.textContent = state.contractAddress
    ? shortHex(state.contractAddress)
    : "No contract";
  refs.walletLabel.textContent = state.walletAddress
    ? `Wallet ${shortHex(state.walletAddress)}`
    : "No wallet";
}

function resetStats() {
  Object.values(refs.stats).forEach((node) => {
    node.textContent = "—";
  });
}

function renderStats(stats) {
  Object.entries(refs.stats).forEach(([key, node]) => {
    node.textContent = Number(stats?.[key] ?? 0).toLocaleString();
  });
}

function statusClass(status) {
  const normalized = String(status || "open").toLowerCase();
  return `status-badge status-${normalized}`;
}

function renderEmptyLedger(title, detail) {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";
  wrapper.append(
    textNode("span", "empty-symbol", "↳"),
  );
  wrapper.firstChild.setAttribute("aria-hidden", "true");
  const copy = document.createElement("div");
  copy.append(textNode("h4", "", title), textNode("p", "", detail));
  wrapper.append(copy);
  refs.bountyList.replaceChildren(wrapper);
}

function renderLedgerError(error) {
  const wrapper = document.createElement("div");
  wrapper.className = "ledger-error";
  const copy = document.createElement("div");
  copy.append(
    textNode("h4", "", "Contract state unavailable"),
    textNode("p", "", error.message || String(error)),
  );
  wrapper.append(copy);
  refs.bountyList.replaceChildren(wrapper);
}

function renderBounties(bounties) {
  clearNode(refs.bountyList);
  if (!Array.isArray(bounties) || bounties.length === 0) {
    renderEmptyLedger("No bounties yet", "This deployment returned an empty ledger.");
    return;
  }

  const fragment = document.createDocumentFragment();
  bounties.forEach((bounty) => {
    const row = document.createElement("button");
    row.className = "bounty-row";
    row.type = "button";
    row.dataset.bountyId = String(bounty.bounty_id);
    row.setAttribute("aria-label", `Inspect bounty ${bounty.bounty_id}`);

    const requirementCount = Number(bounty.total_count || 0);
    const passedCount = Number(bounty.passed_count || 0);
    const commit = bounty.submission_commit
      ? shortHex(bounty.submission_commit, 8, 6)
      : "No submission";

    const main = document.createElement("span");
    main.className = "bounty-main";
    main.append(
      textNode("strong", "", `${requirementCount} requirement${requirementCount === 1 ? "" : "s"}`),
      textNode("span", "", `Commit ${commit}`),
    );

    row.append(
      textNode("span", "bounty-id", `#${bounty.bounty_id}`),
      main,
      textNode("span", statusClass(bounty.status), bounty.status || "UNKNOWN"),
      textNode(
        "span",
        "bounty-metric",
        `${passedCount}/${requirementCount} passed · threshold ${bounty.threshold ?? "—"}`,
      ),
      textNode("span", "row-arrow", "→"),
    );
    fragment.append(row);
  });
  refs.bountyList.append(fragment);
}

function parseVerdict(bounty) {
  if (!bounty?.verdict_json) return null;
  try {
    return JSON.parse(bounty.verdict_json);
  } catch {
    return null;
  }
}

function renderInspectError(error) {
  clearNode(refs.inspectOutput);
  const card = document.createElement("div");
  card.className = "inspect-card";
  card.append(
    textNode("h4", "", "Inspection unavailable"),
    textNode("p", "", error.message || String(error)),
  );
  refs.inspectOutput.append(card);
}

function renderInspect(bounty) {
  clearNode(refs.inspectOutput);
  const summary = document.createElement("div");
  summary.className = "inspect-card";

  const meta = document.createElement("div");
  meta.className = "inspect-meta";
  const fields = [
    ["Status", bounty.status || "UNKNOWN"],
    ["Commit", bounty.submission_commit || "Not submitted"],
    ["Evidence digest", bounty.evidence_hash || "Not verified"],
    ["Attempts", String(bounty.attempt_count ?? 0)],
  ];
  fields.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.append(textNode("span", "", label), textNode("strong", "", value));
    meta.append(item);
  });
  summary.append(meta);

  const verdict = parseVerdict(bounty);
  if (verdict?.details?.length) {
    const decisions = document.createElement("div");
    decisions.className = "decision-list";
    verdict.details.forEach((detail) => {
      const item = document.createElement("div");
      item.className = "decision-item";
      const decision = String(detail.result || "UNCLEAR").toUpperCase();
      const tone =
        decision === "PASS"
          ? "verified"
          : decision === "FAIL"
            ? "rejected"
            : "inconclusive";
      const copy = document.createElement("div");
      copy.append(
        textNode("strong", "", detail.requirement || "Requirement"),
        textNode("p", "", detail.reason || "No reason recorded."),
      );
      item.append(
        textNode("span", `status-badge status-${tone}`, decision),
        copy,
      );
      decisions.append(item);
    });
    summary.append(decisions);
  } else {
    summary.append(
      textNode(
        "p",
        "",
        "No verdict is stored yet. Submitted bounties need decentralized verification.",
      ),
    );
  }
  refs.inspectOutput.append(summary);
}

function resetTransactionPanel(message = "Write actions remain blocked until both reads and a wallet are connected.") {
  refs.transactionTitle.textContent = "No active transaction";
  refs.transactionState.textContent = "Idle";
  refs.transactionState.dataset.tone = "idle";
  refs.transactionSteps.forEach((step) => {
    step.dataset.state = "idle";
  });
  refs.transactionResult.dataset.tone = "idle";
  refs.transactionResult.replaceChildren(textNode("p", "", message));
}

function setTransactionProgress(index, label) {
  refs.transactionTitle.textContent = label;
  refs.transactionState.textContent = "In progress";
  refs.transactionState.dataset.tone = "loading";
  refs.transactionSteps.forEach((step, stepIndex) => {
    if (stepIndex < index) step.dataset.state = "complete";
    else if (stepIndex === index) step.dataset.state = "active";
    else step.dataset.state = "idle";
  });
}

function setTransactionError(error) {
  refs.transactionState.textContent = "Failed";
  refs.transactionState.dataset.tone = "error";
  const active = refs.transactionSteps.find((step) => step.dataset.state === "active");
  if (active) active.dataset.state = "error";
  refs.transactionResult.dataset.tone = "error";
  refs.transactionResult.replaceChildren(
    textNode("strong", "", "Transaction did not complete"),
    textNode("p", "", error.message || String(error)),
  );
}

function setTransactionSuccess(label, hash, proof) {
  refs.transactionTitle.textContent = label;
  refs.transactionState.textContent = "Confirmed";
  refs.transactionState.dataset.tone = "success";
  refs.transactionSteps.forEach((step) => {
    step.dataset.state = "complete";
  });
  refs.transactionResult.dataset.tone = "success";
  clearNode(refs.transactionResult);
  refs.transactionResult.append(
    textNode("strong", "", proof),
    textNode("span", "", `Transaction ${hash}`),
  );
  if (currentNetwork().explorer) {
    const link = document.createElement("a");
    link.href = currentNetwork().explorer;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open network explorer";
    refs.transactionResult.append(link);
  }
}

function updateActionAvailability() {
  const writesReady =
    state.readConnected &&
    state.sourceMatch &&
    Boolean(state.writeClient) &&
    Boolean(state.walletAddress) &&
    !state.busy;
  actionButtons.forEach((button) => {
    button.disabled = !writesReady;
    button.title = writesReady
      ? ""
      : "Connect a source-matched contract and wallet before writing.";
  });
  inspectButton.disabled = !state.readConnected || state.busy;
  refs.refreshState.disabled = !state.readConnected || state.busy;
  refs.connectReads.disabled = state.busy;
  refs.connectWallet.disabled = state.busy || !state.readConnected || !state.sourceMatch;
}

function setBusy(value) {
  state.busy = Boolean(value);
  updateActionAvailability();
}

function clearWalletConnection() {
  state.walletUnsubscribe?.();
  state.walletUnsubscribe = null;
  state.writeClient = null;
  state.walletProvider = null;
  state.walletAddress = "";
}

function resetConnection({ keepAddress = true } = {}) {
  state.readClient = null;
  clearWalletConnection();
  state.readConnected = false;
  state.sourceMatch = false;
  state.deployedSourceHash = "";
  state.bounties = [];
  state.stats = null;
  if (!keepAddress) {
    state.contractAddress = "";
    refs.contractAddress.value = "";
  }
  resetStats();
  renderEmptyLedger("Waiting for a deployment", "Connect a reviewed contract to load live bounties.");
  resetTransactionPanel();
  updateConnectionMeta();
  updateActionAvailability();
}

async function readContract(functionName, args = []) {
  if (!state.readClient || !state.readConnected) {
    throw new Error("Connect contract reads first.");
  }
  return state.readClient.readContract({
    address: state.contractAddress,
    functionName,
    args,
  });
}

async function getBounty(bountyId) {
  const raw = await readContract("get_bounty", [bountyId]);
  return safeJson(raw, "get_bounty");
}

async function loadDashboard() {
  try {
    const [statsRaw, bountiesRaw] = await Promise.all([
      readContract("get_stats"),
      readContract("get_all_bounties"),
    ]);
    const stats = safeJson(statsRaw, "get_stats");
    const bounties = safeJson(bountiesRaw, "get_all_bounties");
    if (!Array.isArray(bounties)) {
      throw new Error("get_all_bounties did not return an array.");
    }
    state.stats = stats;
    state.bounties = bounties;
    renderStats(stats);
    renderBounties(bounties);
    return { stats, bounties };
  } catch (error) {
    state.stats = null;
    state.bounties = [];
    resetStats();
    renderLedgerError(error);
    throw error;
  }
}

async function verifyContractInterface(client, address) {
  const schema = await client.getContractSchema(address);
  const methods = schema?.methods || {};
  const missing = REQUIRED_METHODS.filter((name) => !methods[name]);
  if (missing.length) {
    throw new Error(`Contract interface is missing: ${missing.join(", ")}.`);
  }
  return schema;
}

async function verifySourceMatch(client, address) {
  const deployedSource = await client.getContractCode(address);
  const reviewedNormalized = normalizeSource(reviewedContractSource);
  const deployedNormalized = normalizeSource(deployedSource);
  const [reviewedHash, deployedHash] = await Promise.all([
    sha256(reviewedNormalized),
    sha256(deployedNormalized),
  ]);
  state.reviewedSourceHash = reviewedHash;
  state.deployedSourceHash = deployedHash;
  return reviewedHash === deployedHash;
}

async function connectReads() {
  const address = assertContractAddress(refs.contractAddress.value);
  state.networkKey = refs.network.value;
  state.contractAddress = address;
  resetConnection({ keepAddress: true });
  state.contractAddress = address;
  setBusy(true);
  setConnectionStatus(
    "loading",
    "Checking deployed contract",
    "Verifying interface, source hash, and live read methods.",
  );

  try {
    const client = createClient({ chain: currentNetwork().chain });
    await verifyContractInterface(client, address);

    state.readClient = client;
    state.readConnected = true;
    state.sourceMatch = await verifySourceMatch(client, address);
    await loadDashboard();

    if (state.sourceMatch) {
      setConnectionStatus(
        "success",
        "Source-matched deployment connected",
        `Reviewed and deployed SHA-256 match at ${shortHex(state.reviewedSourceHash, 10, 8)}.`,
      );
      refs.buildPosture.textContent = `Current source matched on ${currentNetwork().label}.`;
    } else {
      setConnectionStatus(
        "error",
        "Contract reads work, but source does not match",
        `Reviewed ${shortHex(state.reviewedSourceHash, 10, 8)} · deployed ${shortHex(state.deployedSourceHash, 10, 8)}. Writes are blocked.`,
      );
      refs.buildPosture.textContent = "Connected deployment differs from the reviewed source.";
    }
  } catch (error) {
    state.readClient = null;
    state.readConnected = false;
    state.sourceMatch = false;
    resetStats();
    renderLedgerError(error);
    setConnectionStatus(
      "error",
      "Contract connection failed",
      error.message || String(error),
    );
    refs.buildPosture.textContent = "Current source: undeployed until proven otherwise.";
  } finally {
    setBusy(false);
  }
}

async function connectWallet() {
  if (!state.readConnected || !state.sourceMatch) {
    throw new Error("Connect a source-matched deployment before connecting a write wallet.");
  }
  setBusy(true);
  setConnectionStatus(
    "loading",
    "Waiting for wallet",
    `Approve the account and ${currentNetwork().label} network requests.`,
  );
  try {
    clearWalletConnection();
    const { provider, account, client: writeClient } = await connectInjectedWallet({
      ethereum: window.ethereum,
      eventTarget: window,
      network: currentNetwork(),
      createWalletClient: ({ chain, account: walletAccount, provider: walletProvider }) =>
        createClient({
          chain,
          account: walletAccount,
          provider: walletProvider,
        }),
    });

    state.walletAddress = account;
    state.walletProvider = provider;
    state.writeClient = writeClient;
    state.walletUnsubscribe = subscribeProvider(provider, {
      onAccountsChanged(accounts) {
        const nextAccount = accounts?.[0] || "";
        clearWalletConnection();
        updateConnectionMeta();
        updateActionAvailability();
        setConnectionStatus(
          state.sourceMatch ? "success" : "error",
          nextAccount ? "Wallet account changed" : "Wallet disconnected",
          nextAccount
            ? "Reconnect the wallet client before the next write."
            : "Write actions are disabled.",
        );
      },
      onChainChanged() {
        clearWalletConnection();
        updateConnectionMeta();
        updateActionAvailability();
        setConnectionStatus(
          "error",
          "Wallet network changed",
          "Reconnect the wallet on the selected GenLayer network before writing.",
        );
      },
    });
    setConnectionStatus(
      "success",
      "Reads, source, and wallet are ready",
      `Writes will target ${shortHex(state.contractAddress)} on ${currentNetwork().label}.`,
    );
    resetTransactionPanel("Choose an action. Success will require a receipt and confirmed state change.");
  } catch (error) {
    clearWalletConnection();
    setConnectionStatus(
      "error",
      "Wallet connection failed",
      error.message || String(error),
    );
    throw error;
  } finally {
    setBusy(false);
  }
}

async function writeWithProof(label, functionName, args, confirmState) {
  if (!state.readConnected || !state.sourceMatch) {
    throw new Error("A source-matched read connection is required.");
  }
  if (!state.writeClient || !state.walletAddress) {
    throw new Error("Connect the wallet before writing.");
  }

  setBusy(true);
  try {
    setTransactionProgress(0, label);
    assertContractAddress(state.contractAddress);

    setTransactionProgress(1, label);
    const transactionHash = await state.writeClient.writeContract({
      address: state.contractAddress,
      functionName,
      args,
      value: BigInt(0),
    });
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(transactionHash))) {
      throw new Error("The wallet did not return a valid transaction hash.");
    }

    setTransactionProgress(2, label);
    const receipt = await state.readClient.waitForTransactionReceipt({
      hash: transactionHash,
      status: TransactionStatus.ACCEPTED,
      interval: 2000,
      retries: 180,
    });

    setTransactionProgress(3, label);
    assertSuccessfulExecution(receipt);

    setTransactionProgress(4, label);
    const proof = await confirmState();
    setTransactionSuccess(label, transactionHash, proof);
    return { transactionHash, receipt, proof };
  } catch (error) {
    setTransactionError(error);
    throw error;
  } finally {
    setBusy(false);
  }
}

function activateTab(name, { focus = false } = {}) {
  refs.tabs.forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
  });
  refs.panels.forEach((panel) => {
    panel.hidden = panel.id !== `panel-${name}`;
  });
}

async function inspectBountyById(id) {
  if (!state.readConnected) {
    throw new Error("Connect contract reads before inspecting a bounty.");
  }
  const bounty = await getBounty(id);
  renderInspect(bounty);
  return bounty;
}

refs.createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const requirements = document
      .querySelector("#create-requirements")
      .value.split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    if (requirements.length < 1 || requirements.length > 8) {
      throw new Error("Enter between 1 and 8 requirements.");
    }
    if (requirements.some((item) => item.length > 240)) {
      throw new Error("Each requirement must be 240 characters or fewer.");
    }
    const sourceUrl = assertGitHubUrl(document.querySelector("#create-source").value);
    const threshold = Number(refs.threshold.value);
    const beforeTotal = Number(state.stats?.total ?? 0);

    await writeWithProof(
      "Create bounty",
      "create_bounty",
      [JSON.stringify(requirements), sourceUrl, threshold],
      async () => {
        const { stats } = await loadDashboard();
        const afterTotal = Number(stats.total ?? 0);
        if (afterTotal !== beforeTotal + 1) {
          throw new Error("Receipt succeeded, but the bounty count did not increase.");
        }
        return `Bounty #${afterTotal - 1} exists in live contract state.`;
      },
    );
    refs.createForm.reset();
    refs.threshold.value = "80";
    refs.thresholdOutput.textContent = "80%";
  } catch (error) {
    if (!state.busy) setTransactionError(error);
  }
});

refs.submitForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const bountyId = assertBountyId(document.querySelector("#submit-id").value);
    const submissionUrl = assertGitHubUrl(
      document.querySelector("#submit-url").value,
      { immutable: true },
    );

    await writeWithProof(
      "Submit immutable commit",
      "submit",
      [bountyId, submissionUrl],
      async () => {
        const bounty = await getBounty(bountyId);
        if (bounty.status !== "SUBMITTED" || bounty.submission_url !== submissionUrl) {
          throw new Error("Receipt succeeded, but the expected submission state was not found.");
        }
        await loadDashboard();
        return `Bounty #${bountyId} stores the immutable submission.`;
      },
    );
    refs.submitForm.reset();
  } catch (error) {
    if (!state.busy) setTransactionError(error);
  }
});

refs.verifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const bountyId = assertBountyId(document.querySelector("#verify-id").value);
    await writeWithProof(
      "Run decentralized verification",
      "verify",
      [bountyId],
      async () => {
        const bounty = await getBounty(bountyId);
        const finalStatuses = new Set(["VERIFIED", "REJECTED", "INCONCLUSIVE"]);
        if (!finalStatuses.has(bounty.status) || !bounty.verdict_json) {
          throw new Error("Receipt succeeded, but no final verdict state was found.");
        }
        await loadDashboard();
        return `Bounty #${bountyId} is ${bounty.status.toLowerCase()} in contract state.`;
      },
    );
  } catch (error) {
    if (!state.busy) setTransactionError(error);
  }
});

refs.inspectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    setBusy(true);
    const bountyId = assertBountyId(document.querySelector("#inspect-id").value);
    await inspectBountyById(bountyId);
  } catch (error) {
    renderInspectError(error);
  } finally {
    setBusy(false);
  }
});

refs.bountyList.addEventListener("click", async (event) => {
  const row = event.target.closest("[data-bounty-id]");
  if (!row) return;
  const bountyId = row.dataset.bountyId;
  activateTab("inspect");
  document.querySelector("#inspect-id").value = bountyId;
  document.querySelector("#workflow").scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    setBusy(true);
    await inspectBountyById(bountyId);
  } catch (error) {
    renderInspectError(error);
  } finally {
    setBusy(false);
  }
});

refs.tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + refs.tabs.length) % refs.tabs.length;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % refs.tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = refs.tabs.length - 1;
    activateTab(refs.tabs[nextIndex].dataset.tab, { focus: true });
  });
});

refs.threshold.addEventListener("input", () => {
  refs.thresholdOutput.textContent = `${refs.threshold.value}%`;
});

refs.network.addEventListener("change", () => {
  state.networkKey = refs.network.value;
  resetConnection({ keepAddress: false });
  const configured = DEPLOYMENTS[state.networkKey];
  refs.contractAddress.value = configured;
  state.contractAddress = configured;
  setConnectionStatus(
    "idle",
    configured ? "Deployment address loaded" : "Deployment not configured",
    configured
      ? "Connect reads to verify the deployed source before enabling writes."
      : "Provide the deployment of this exact source revision.",
  );
});

refs.contractAddress.addEventListener("input", () => {
  if (state.readConnected) {
    resetConnection({ keepAddress: true });
    setConnectionStatus(
      "idle",
      "Address changed",
      "Reconnect reads to verify the new deployment and source hash.",
    );
  }
  state.contractAddress = refs.contractAddress.value.trim();
  updateConnectionMeta();
});

refs.connectReads.addEventListener("click", () => {
  connectReads().catch((error) => {
    setConnectionStatus("error", "Contract connection failed", error.message || String(error));
  });
});

refs.connectWallet.addEventListener("click", () => {
  connectWallet().catch((error) => {
    setTransactionError(error);
  });
});

refs.refreshState.addEventListener("click", async () => {
  try {
    setBusy(true);
    await loadDashboard();
    setConnectionStatus(
      state.sourceMatch ? "success" : "error",
      state.sourceMatch ? "Live state refreshed" : "State refreshed; source mismatch remains",
      `${state.bounties.length} bounties loaded from ${currentNetwork().label}.`,
    );
  } catch (error) {
    setConnectionStatus("error", "State refresh failed", error.message || String(error));
  } finally {
    setBusy(false);
  }
});

document.querySelector('[data-action="jump-config"]').addEventListener("click", () => {
  document.querySelector("#contract-configuration").scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
});

document.querySelector('[data-action="jump-workflow"]').addEventListener("click", () => {
  document.querySelector("#workflow").scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
});

async function initialize() {
  state.networkKey = refs.network.value;
  state.reviewedSourceHash = await sha256(normalizeSource(reviewedContractSource));
  const configured = DEPLOYMENTS[state.networkKey];
  if (configured) {
    refs.contractAddress.value = configured;
    state.contractAddress = configured;
    setConnectionStatus(
      "idle",
      "Deployment address loaded",
      "Connect reads to verify the interface and source hash.",
    );
  } else {
    setConnectionStatus(
      "idle",
      "Deployment not configured",
      `Reviewed source SHA-256 ${shortHex(state.reviewedSourceHash, 10, 8)}. Live actions remain disabled.`,
    );
  }
  resetStats();
  resetTransactionPanel();
  updateActionAvailability();
}

initialize().catch((error) => {
  setConnectionStatus("error", "Application initialization failed", error.message || String(error));
});
