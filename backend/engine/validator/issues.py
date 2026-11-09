"""Collect validation issues, numbered in the order they are found."""

from domain.models import IssueCode, IssueSeverity, Power, ValidationIssue
from engine.topology.provinces import PROVINCES


def province_name(code: str | None) -> str:
    if not code:
        return "Unknown"
    return PROVINCES[code].name if code in PROVINCES else code


class IssueCollector:
    """Numbers each issue as it is found and keeps only the requested power's.

    Ids run `issue_<n>_<code>` across every check, so the checks must run in a fixed order.
    """

    def __init__(self, target_power: Power | None = None):
        self.target_power = target_power
        self.issues: list[ValidationIssue] = []
        self._counter = 0

    def add(
        self,
        severity: IssueSeverity,
        code: IssueCode,
        title: str,
        message: str,
        unit_ids: list[str],
        provinces: list[str],
        power: Power,
    ) -> None:
        if self.target_power and power != self.target_power:
            return
        self._counter += 1
        self.issues.append(
            ValidationIssue(
                id=f"issue_{self._counter}_{code.value}",
                severity=severity,
                code=code,
                title=title,
                message=message,
                unit_ids=unit_ids,
                provinces=provinces,
                power=power,
            )
        )
