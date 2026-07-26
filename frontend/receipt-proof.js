const SUCCESSFUL_CONSENSUS_RESULTS = new Set(["AGREE", "MAJORITY_AGREE"]);

function normalize(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function assertSuccessfulExecution(receipt) {
  const directResult = normalize(
    receipt?.txExecutionResultName ?? receipt?.tx_execution_result_name,
  );
  if (directResult) {
    if (directResult !== "FINISHED_WITH_RETURN") {
      throw new Error(`Transaction was not successful: ${directResult}.`);
    }
    return directResult;
  }

  const consensus = receipt?.consensus_data ?? receipt?.consensusData;
  const leaderReceipts = consensus?.leader_receipt ?? consensus?.leaderReceipt;
  const executionResults = (Array.isArray(leaderReceipts) ? leaderReceipts : [])
    .map((item) => normalize(item?.execution_result ?? item?.executionResult))
    .filter(Boolean);

  if (!executionResults.length) {
    throw new Error("Transaction was not successful: MISSING_EXECUTION_RESULT.");
  }

  const consensusResult = normalize(receipt?.result_name ?? receipt?.resultName);
  if (consensusResult && !SUCCESSFUL_CONSENSUS_RESULTS.has(consensusResult)) {
    throw new Error(`Transaction consensus was not successful: ${consensusResult}.`);
  }
  if (consensusResult) {
    // Studionet may preserve failed receipts from dissenting or superseded
    // executions. The canonical consensus result decides the transaction;
    // the caller must still confirm the expected contract state afterward.
    return consensusResult;
  }

  const failedResult = executionResults.find((result) => result !== "SUCCESS");
  if (failedResult) {
    throw new Error(`Transaction was not successful: ${failedResult}.`);
  }

  return "SUCCESS";
}
