import test from "node:test";
import assert from "node:assert/strict";
import { assertSuccessfulExecution } from "../frontend/receipt-proof.js";

test("accepts EVM-style successful execution", () => {
  assert.equal(
    assertSuccessfulExecution({ txExecutionResultName: "FINISHED_WITH_RETURN" }),
    "FINISHED_WITH_RETURN",
  );
});

test("accepts Studionet successful leader receipts", () => {
  assert.equal(
    assertSuccessfulExecution({
      result_name: "MAJORITY_AGREE",
      consensus_data: {
        leader_receipt: [
          { execution_result: "SUCCESS" },
          { execution_result: "SUCCESS" },
        ],
      },
    }),
    "SUCCESS",
  );
});

test("rejects a failed Studionet execution", () => {
  assert.throws(
    () =>
      assertSuccessfulExecution({
        result_name: "MAJORITY_AGREE",
        consensus_data: {
          leader_receipt: [{ execution_result: "ERROR" }],
        },
      }),
    /not successful: ERROR/,
  );
});

test("rejects a failed consensus result", () => {
  assert.throws(
    () =>
      assertSuccessfulExecution({
        result_name: "MAJORITY_DISAGREE",
        consensus_data: {
          leader_receipt: [{ execution_result: "SUCCESS" }],
        },
      }),
    /consensus was not successful/,
  );
});

test("fails closed when execution evidence is missing", () => {
  assert.throws(
    () => assertSuccessfulExecution({ result_name: "MAJORITY_AGREE" }),
    /MISSING_EXECUTION_RESULT/,
  );
});
