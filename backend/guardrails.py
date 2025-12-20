import re

FORBIDDEN_PATTERNS = [
    r"jailbreak", 
    r"ignore previous instructions",
    r"override.*rules",
    r"bypass.*policy",
    r"illegal",
    r"hack",
    r"commit.*crime",
    r"sexual",
    r"self[- ]?harm",
]

PII_PATTERNS = [
    r"\b\d{11,16}\b",           # credit card-like numbers
    r"\b[0-9]{2}-[0-9]{6}-\d\b", # national ID formats (example)
    r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"
]


def check_forbidden(user_input: str) -> bool:
    """Return True if message triggers a forbidden pattern."""
    text = user_input.lower()
    return any(re.search(pattern, text) for pattern in FORBIDDEN_PATTERNS)


def check_pii(user_input: str) -> bool:
    """Return True if personal information is detected."""
    return any(re.search(pattern, user_input, flags=re.IGNORECASE) for pattern in PII_PATTERNS)
    