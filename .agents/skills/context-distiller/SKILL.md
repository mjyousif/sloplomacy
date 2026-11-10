---
name: context-distiller
description: Protocol for stripping noise, extracting minimal type definitions and function signatures, and preparing under-1,500-token problem specifications before delegating to Gemini 4 Argon (precision-surgeon).
---

# Context Distiller

This skill defines the mandatory protocol for distilling complex code and adjudication failures down to a noise-free, high-density specification under **1,500 tokens** before delegating to `precision-surgeon` (`gemini-4-argon`).

## 1. Token Budget & Gatekeeping Invariants

- **Token Budget Ceiling**: **< 1,500 tokens total** in the prompt passed to `precision-surgeon`.
- **Stateless Solvability**: The distillation must provide enough semantic context for Argon to solve the problem in a single pass without needing to inspect other repo files.
- **Strict Prohibitions**:
  - NEVER pass raw terminal test output, traceback stacks, or stderr logs.
  - NEVER pass whole files or modules.
  - NEVER pass conversational chat history, user turn transcripts, or SVG map geometry.

## 2. Noise Reduction & Extraction Protocol

When preparing a prompt for `precision-surgeon`:

1. **Extract Type Definitions**:
   - Locate the relevant Pydantic models / dataclasses in `backend/domain/` (e.g. `board.py`, `orders.py`, `game_state.py`).
   - Strip all docstrings, comments, validator decorators, and fields not directly participating in the calculation.
   - Retain only the schema required to understand input arguments and return structures.

2. **Isolate Target Function**:
   - Extract strictly the single function or method undergoing logic failure (from `backend/engine/adjudicator/`, `backend/engine/topology/`, or `backend/engine/validator/`).
   - Strip unrelated helper functions in the file unless the target function directly calls them and the bug lives in that interaction.

3. **Formulate Explicit Invariants**:
   - Translate the DATC (Diplomacy Adjudicator Test Cases) rule or game mechanic into concise bullet points.
   - Example: *"A convoying fleet dislodged by an attack from a province not part of the convoy route disrupts the convoy; an army convoyed through a disrupted convoy cannot reach its destination."*

4. **Isolate Failing Assertion**:
   - Quote solely the specific failing `assert` statement or test condition from `backend/tests/`.
   - Include the exact inputs given to the test and the discrepancy between actual output and expected output.

## 3. Standard Distillation Template

Always format the distillation payload using this markdown structure:

```markdown
### Problem Statement: [Brief Function/Rule Name]

#### 1. Invariants & Rules
- [Invariant 1]
- [Invariant 2]

#### 2. Minimal Type Definitions
```python
class Power(str, Enum):
    AUSTRIA = "AUSTRIA"
    ...

class Unit(BaseModel):
    unit_type: UnitType
    power: Power
    province: str
    coast: Optional[str] = None
```

#### 3. Target Function (Failing)
```python
def resolve_convoy_step(...) -> ResolutionResult:
    # Current failing logic...
```

#### 4. Failing Test Case & Assertion
- **Input**:
  - `orders = [...]`
- **Actual**: `result.status == "FAILED"`
- **Expected**: `result.status == "SUCCEEDED"`
- **Assertion**: `assert resolve_convoy_step(orders).is_successful is True`

#### 5. Output Requirement
Return ONLY a unified diff or clean drop-in function replacement for `resolve_convoy_step`. No explanatory prose.
```

## 4. Pre-Delegation Verification Checklist

Before dispatching to `precision-surgeon`:
- [ ] Is total character length < 6,000 characters (~1,500 tokens)?
- [ ] Are all raw traceback dumps and terminal logs stripped?
- [ ] Are all docstrings and extraneous comments removed from code blocks?
- [ ] Does the payload contain exact inputs, expected outputs, and the failing assertion?
- [ ] Does the request ask strictly for code / diff with zero conversational fluff?
