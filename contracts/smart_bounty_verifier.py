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
