"""PreToolUse hook: block shell commands that would read secret files.

Exit 2 blocks the command and shows the message to Claude.
"""

import json
import re
import sys

data = json.load(sys.stdin)
command = data.get("tool_input", {}).get("command", "")

# .env, .env.local, deploy/.env ... but not .env.example
SECRET_FILE = re.compile(r"(^|[\s/'\"=])\.env(\.(?!example\b)[\w.-]+)?(?=$|[\s'\";|&)])")
READERS = re.compile(r"\b(cat|less|more|head|tail|grep|rg|sed|awk|cp|scp|base64|xxd|strings|source)\b")

if SECRET_FILE.search(command) and READERS.search(command):
    print(
        "Blocked: this command would read or copy a secrets file (.env). "
        "Use .env.example for variable names, or ask the user for the value you need.",
        file=sys.stderr,
    )
    sys.exit(2)

sys.exit(0)
