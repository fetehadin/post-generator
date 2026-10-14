"""PostToolUse hook: auto-format the file Claude just edited.

Python -> ruff (fix + format). TS/JS/CSS/JSON/MD in frontend/ -> prettier.
Silent no-op when the formatter isn't installed yet. Never blocks.
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

data = json.load(sys.stdin)
file_path = data.get("tool_input", {}).get("file_path")
if not file_path:
    sys.exit(0)

path = Path(file_path)
root = Path(os.environ.get("CLAUDE_PROJECT_DIR", "."))


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, cwd=root, capture_output=True, timeout=50)


if path.suffix == ".py":
    ruff = root / "backend/.venv/bin/ruff"
    ruff_cmd = str(ruff) if ruff.exists() else shutil.which("ruff")
    if ruff_cmd:
        run([ruff_cmd, "check", "--fix", "--quiet", str(path)])
        run([ruff_cmd, "format", "--quiet", str(path)])
elif path.suffix in {".ts", ".tsx", ".js", ".jsx", ".css", ".json"} and "frontend" in path.parts:
    prettier = root / "frontend/node_modules/.bin/prettier"
    if prettier.exists():
        run([str(prettier), "--write", "--log-level", "silent", str(path)])

sys.exit(0)
