# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

import json
import typing
from dataclasses import dataclass

# Helper function for Address-to-string conversion (R20)
def _addr_str(a) -> str:
    try:
        return a.as_hex
    except Exception:
        return str(a)

@allow_storage
@dataclass
class Bounty:
    creator: str              # creator address as hex string
    requirements_json: str    # JSON array: ["Has README", "Has tests", ...]
    source_url: str           # reference/context URL (repo, spec, etc.)
    submission_url: str       # URL of submitted work (initially empty "")
    submitter: str            # submitter address (initially empty "")
    status: str               # OPEN | SUBMITTED | VERIFIED | REJECTED
    verdict_json: str         # full verdict payload after verification (initially "")
    passed_count: bigint      # number of requirements that passed
    total_count: bigint       # total number of requirements
    threshold: bigint         # minimum passed_count needed for VERIFIED

class Contract(gl.Contract):
    bounties: TreeMap[str, Bounty]   # str(id) -> Bounty
    next_id: bigint

    def __init__(self):
        self.next_id = bigint(0)
        # DO NOT touch TreeMap/DynArray here (R2)

    @gl.public.write
    def create_bounty(self, requirements_json: str, source_url: str, threshold_pct: int) -> None:
        try:
            reqs = json.loads(requirements_json)
        except Exception:
            raise gl.vm.UserError("Invalid requirements JSON format")
        
        if not isinstance(reqs, list):
            raise gl.vm.UserError("Requirements must be a JSON array")
        
        if len(reqs) == 0:
            raise gl.vm.UserError("Requirements array cannot be empty")
            
        if len(reqs) > 10:
            raise gl.vm.UserError("Requirements array cannot exceed 10 items")
            
        for req in reqs:
            if not isinstance(req, str):
                raise gl.vm.UserError("All requirements must be strings")
            if len(req.strip()) == 0:
                raise gl.vm.UserError("Requirement string cannot be empty")
                
        if not (source_url.startswith("http://") or source_url.startswith("https://")):
            raise gl.vm.UserError("Source URL must start with http:// or https://")
            
        if threshold_pct < 0 or threshold_pct > 100:
            raise gl.vm.UserError("Threshold percentage must be between 0 and 100")
            
        total = len(reqs)
        if threshold_pct == 0:
            threshold_val = 0
        else:
            threshold_val = (total * threshold_pct + 99) // 100
            
        bounty_id = str(int(self.next_id))
        
        new_bounty = Bounty(
            creator=_addr_str(gl.message.sender_address),
            requirements_json=requirements_json,
            source_url=source_url,
            submission_url="",
            submitter="",
            status="OPEN",
            verdict_json="",
            passed_count=bigint(0),
            total_count=bigint(total),
            threshold=bigint(threshold_val)
        )
        
        self.bounties[bounty_id] = new_bounty
        self.next_id = self.next_id + bigint(1)

    @gl.public.write
    def submit(self, bounty_id: str, submission_url: str) -> None:
        if bounty_id not in self.bounties:
            raise gl.vm.UserError("Bounty not found")
            
        bounty = self.bounties[bounty_id]
        if bounty.status not in ("OPEN", "REJECTED"):
            raise gl.vm.UserError("Bounty not open for submission")
            
        if not (submission_url.startswith("http://") or submission_url.startswith("https://")):
            raise gl.vm.UserError("Submission URL must start with http:// or https://")
            
        bounty.submission_url = submission_url
        bounty.submitter = _addr_str(gl.message.sender_address)
        bounty.status = "SUBMITTED"
        bounty.verdict_json = ""
        bounty.passed_count = bigint(0)
        
        self.bounties[bounty_id] = bounty

    @gl.public.write
    def verify(self, bounty_id: str) -> None:
        if bounty_id not in self.bounties:
            raise gl.vm.UserError("Bounty not found")
            
        bounty = self.bounties[bounty_id]
        if bounty.status != "SUBMITTED":
            raise gl.vm.UserError("Bounty status must be SUBMITTED to verify")
            
        # Capture variables for nondet execution (no self access allowed inside)
        reqs_list = json.loads(bounty.requirements_json)
        sub_url = str(bounty.submission_url)
        src_url = str(bounty.source_url)
        threshold_val = int(bounty.threshold)
        total_val = int(bounty.total_count)
        
        def leader_fn() -> str:
            # Fetch submission page content
            try:
                sub_page = gl.nondet.web.render(sub_url, mode="text")
                submission_content = (sub_page or "")[:8000]
            except Exception:
                submission_content = ""

            # Fetch source/context page content (optional)
            source_content = ""
            if src_url:
                try:
                    src_page = gl.nondet.web.render(src_url, mode="text")
                    source_content = (src_page or "")[:4000]
                except Exception:
                    source_content = ""
                    
            reqs_formatted = ""
            for idx, r in enumerate(reqs_list, 1):
                reqs_formatted += f"{idx}. {r}\n"
                
            prompt = f"You are an impartial bounty reviewer on a decentralized court.\n" \
                     f"Evaluate whether the submission meets EACH requirement.\n\n" \
                     f"REQUIREMENTS:\n{reqs_formatted}\n" \
                     f"SOURCE/CONTEXT PAGE:\n{source_content}\n\n" \
                     f"SUBMISSION PAGE:\n{submission_content}\n\n" \
                     f"For each requirement, judge PASS or FAIL with a brief reason.\n" \
                     f"Then give an overall verdict: PASS if >= {threshold_val} of {total_val} requirements pass, else FAIL.\n" \
                     f"If the submission page is empty or unreachable, rule FAIL with low confidence.\n\n" \
                     f"Respond ONLY as JSON (no markdown fences):\n" \
                     f"{{\n" \
                     f"  \"details\": [\n" \
                     f"    {{\"requirement\": \"...\", \"result\": \"PASS\"|\"FAIL\", \"reason\": \"...\"}},\n" \
                     f"    ...\n" \
                     f"  ],\n" \
                     f"  \"passed_count\": ,\n" \
                     f"  \"total_count\": ,\n" \
                     f"  \"verdict\": \"PASS\"|\"FAIL\"\n" \
                     f"}}"

            try:
                raw = gl.nondet.exec_prompt(prompt, response_format="json")
            except Exception:
                raw = {}
                
            if not isinstance(raw, dict):
                raw = {}
                
            # Normalize verdict
            verdict_val = str(raw.get("verdict", "")).strip().upper()
            if verdict_val in ("PASSED", "PASS"):
                verdict_val = "PASS"
            elif verdict_val in ("FAILED", "FAIL"):
                verdict_val = "FAIL"
            else:
                verdict_val = "FAIL"
                
            # Normalize details list
            details = raw.get("details", [])
            if not isinstance(details, list):
                details = []
                
            normalized_details = []
            calculated_passed = 0
            
            for i, req in enumerate(reqs_list):
                llm_item = details[i] if i < len(details) else {}
                if not isinstance(llm_item, dict):
                    llm_item = {}
                    
                req_text = str(llm_item.get("requirement", req)).strip()[:200]
                res_str = str(llm_item.get("result", "FAIL")).strip().upper()
                if res_str in ("PASSED", "PASS"):
                    res_str = "PASS"
                else:
                    res_str = "FAIL"
                    
                reason_str = str(llm_item.get("reason", "No reason provided")).strip()[:200]
                
                if res_str == "PASS":
                    calculated_passed += 1
                    
                normalized_details.append({
                    "requirement": req_text,
                    "result": res_str,
                    "reason": reason_str
                })
                
            # Normalize passed_count
            passed_count_val = raw.get("passed_count", calculated_passed)
            try:
                passed_count_val = int(passed_count_val)
            except Exception:
                passed_count_val = calculated_passed
                
            passed_count_val = max(0, min(total_val, passed_count_val))
            
            # Enforce threshold strictly for final verdict
            if passed_count_val >= threshold_val:
                verdict_val = "PASS"
            else:
                verdict_val = "FAIL"
                
            normalized = {
                "details": normalized_details,
                "passed_count": passed_count_val,
                "total_count": total_val,
                "verdict": verdict_val
            }
            
            return json.dumps(normalized, sort_keys=True)
            
        def validator_fn(leader_res: typing.Any) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False
            try:
                leader = json.loads(leader_res.calldata)
                mine_str = leader_fn()
                mine = json.loads(mine_str)
                
                if not isinstance(leader, dict) or not isinstance(mine, dict):
                    return False
                if "verdict" not in leader or "verdict" not in mine:
                    return False
                if "passed_count" not in leader or "passed_count" not in mine:
                    return False
                    
                if leader["verdict"] != mine["verdict"]:
                    return False
                    
                passed_diff = abs(int(leader["passed_count"]) - int(mine["passed_count"]))
                if passed_diff > 1:
                    return False
                    
                return True
            except Exception:
                return False
                
        raw_result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        payload = json.loads(raw_result)
        
        bounty.verdict_json = raw_result
        bounty.passed_count = bigint(int(payload["passed_count"]))
        bounty.total_count = bigint(int(payload["total_count"]))
        
        if payload["verdict"] == "PASS":
            bounty.status = "VERIFIED"
        else:
            bounty.status = "REJECTED"
            
        self.bounties[bounty_id] = bounty

    @gl.public.view
    def get_bounty(self, bounty_id: str) -> str:
        if bounty_id not in self.bounties:
            raise gl.vm.UserError("Bounty not found")
        b = self.bounties[bounty_id]
        return json.dumps({
            "creator": b.creator,
            "requirements_json": b.requirements_json,
            "source_url": b.source_url,
            "submission_url": b.submission_url,
            "submitter": b.submitter,
            "status": b.status,
            "verdict_json": b.verdict_json,
            "passed_count": int(b.passed_count),
            "total_count": int(b.total_count),
            "threshold": int(b.threshold)
        })

    @gl.public.view
    def get_all_bounties(self) -> str:
        result = []
        for i in range(int(self.next_id)):
            bounty_id = str(i)
            if bounty_id in self.bounties:
                b = self.bounties[bounty_id]
                result.append({
                    "bounty_id": bounty_id,
                    "creator": b.creator,
                    "requirements_json": b.requirements_json,
                    "source_url": b.source_url,
                    "submission_url": b.submission_url,
                    "submitter": b.submitter,
                    "status": b.status,
                    "verdict_json": b.verdict_json,
                    "passed_count": int(b.passed_count),
                    "total_count": int(b.total_count),
                    "threshold": int(b.threshold)
                })
        return json.dumps(result)

    @gl.public.view
    def get_stats(self) -> str:
        total = 0
        open_cnt = 0
        submitted_cnt = 0
        verified_cnt = 0
        rejected_cnt = 0
        
        for i in range(int(self.next_id)):
            bounty_id = str(i)
            if bounty_id in self.bounties:
                b = self.bounties[bounty_id]
                total += 1
                if b.status == "OPEN":
                    open_cnt += 1
                elif b.status == "SUBMITTED":
                    submitted_cnt += 1
                elif b.status == "VERIFIED":
                    verified_cnt += 1
                elif b.status == "REJECTED":
                    rejected_cnt += 1
                    
        return json.dumps({
            "total": total,
            "open": open_cnt,
            "submitted": submitted_cnt,
            "verified": verified_cnt,
            "rejected": rejected_cnt
        })
