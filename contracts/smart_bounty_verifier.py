# v0.2.16
# { "Depends": "py-genlayer:test" }
from genlayer import *
import json


@gl.contract
class Contract:
    bounties: TreeMap[str, DynArray[u8]]
    next_id: u256

    def __init__(self):
        self.next_id = u256(0)

    def _store(self, bid: str, obj: dict):
        self.bounties[bid] = DynArray[u8](json.dumps(obj).encode())

    def _load(self, bid: str) -> dict:
        return json.loads(bytes(self.bounties[bid]).decode())

    @gl.public.write
    def create_bounty(
        self,
        requirements_json: str,
        source_url: str,
        threshold_pct: u256,
    ):
        reqs = json.loads(requirements_json)
        total = len(reqs)
        thr = int((int(threshold_pct) * total + 99) // 100)

        bid = str(int(self.next_id))
        self.next_id = u256(int(self.next_id) + 1)

        self._store(bid, {
            "creator": str(gl.message.sender_account),
            "requirements_json": requirements_json,
            "source_url": source_url,
            "submission_url": "",
            "submitter": "",
            "status": "OPEN",
            "verdict_json": "",
            "passed_count": 0,
            "total_count": total,
            "threshold": thr,
        })

    @gl.public.write
    def submit(self, bounty_id: str, submission_url: str):
        b = self._load(bounty_id)
        if b["status"] != "OPEN":
            raise Exception("Bounty is not open")
        b["submission_url"] = submission_url
        b["submitter"] = str(gl.message.sender_account)
        b["status"] = "SUBMITTED"
        self._store(bounty_id, b)

    @gl.public.write
    def verify(self, bounty_id: str):
        b = self._load(bounty_id)
        if b["status"] != "SUBMITTED":
            raise Exception("Bounty is not submitted")

        page = gl.get_webpage(b["submission_url"], mode="text")
        reqs = json.loads(b["requirements_json"])
        details = []
        passed = 0

        for req in reqs:
            prompt = (
                f"Requirement: {req}\n\n"
                f"Web page content:\n{page}\n\n"
                "Does the web page satisfy the requirement? "
                "Reply EXACTLY with a JSON object: "
                '{"result":"PASS","reason":"..."} or {"result":"FAIL","reason":"..."}'
            )
            with gl.eq_principle_strict_eq():
                raw = gl.exec_prompt(prompt)
            try:
                obj = json.loads(raw)
            except Exception:
                obj = {"result": "FAIL", "reason": raw[:200]}
            details.append({
                "requirement": req,
                "result": obj.get("result", "FAIL"),
                "reason": obj.get("reason", ""),
            })
            if obj.get("result") == "PASS":
                passed += 1

        verdict = "PASS" if passed >= b["threshold"] else "FAIL"
        b["verdict_json"] = json.dumps({
            "details": details,
            "passed_count": passed,
            "total_count": len(reqs),
            "verdict": verdict,
        })
        b["passed_count"] = passed
        b["status"] = "VERIFIED" if verdict == "PASS" else "REJECTED"
        self._store(bounty_id, b)
