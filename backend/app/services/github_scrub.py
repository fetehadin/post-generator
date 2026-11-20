"""Remove anything that looks like a secret from GitHub text before it is stored (FR-14).

Commit messages and PR descriptions sometimes carry a pasted token or key. They are never
stored or sent to an AI: each match becomes "[removed]". Better to lose a harmless string
than to keep a live key.
"""

import re

PATTERNS = [
    r"gh[pousr]_[A-Za-z0-9]{20,}",  # GitHub tokens
    r"github_pat_[A-Za-z0-9_]{20,}",
    r"sk-(?:ant-|proj-)?[A-Za-z0-9_\-]{16,}",  # OpenAI / Anthropic style
    r"gsk_[A-Za-z0-9]{20,}",  # Groq
    r"AIza[0-9A-Za-z\-_]{30,}",  # Google
    r"AKIA[0-9A-Z]{16}",  # AWS access key id
    r"xox[abposr]-[A-Za-z0-9-]{10,}",  # Slack
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)",
    r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",  # a JWT
]
SECRET = re.compile("|".join(f"(?:{p})" for p in PATTERNS))
# key=..., token: ..., password "...": the value goes, the name stays.
ASSIGNED = re.compile(
    r"\b((?:api[_-]?)?key|secret|token|password|passwd|pwd)(\s*[:=]\s*['\"]?)[^\s'\"]{8,}",
    re.IGNORECASE,
)


def scrub(text: str) -> str:
    return ASSIGNED.sub(r"\1\2[removed]", SECRET.sub("[removed]", text or ""))
