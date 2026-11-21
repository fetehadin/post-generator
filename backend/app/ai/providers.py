"""Everything provider-specific about users' own AI keys (FR-48), in one place.

Adding a provider means adding one entry here (and, if it isn't OpenAI-compatible, a generate
function in client.py). The frontend gets these fields from GET /me/ai-keys.
"""

import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class ProviderInfo:
    id: str
    name: str
    key_url: str  # where to make a key
    # A key from this provider always matches this; "" when keys have no fixed shape.
    prefix: str = ""
    # A free, zero-quota call that proves the key works (a models list or key info), and how
    # the key is sent. None: check with one tiny generation call instead.
    check_url: str | None = None
    check_header: str = "Authorization"  # "Authorization" sends "Bearer <key>"
    free: bool = False  # has a free tier: shown as a "Get free key" card
    steps: tuple[str, ...] = ()
    note: str = ""  # one honest line about what using it means
    hint: str = ""  # how the key starts, for "make sure you copied the whole key"
    pattern: re.Pattern[str] | None = field(init=False, repr=False, compare=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "pattern", re.compile(self.prefix) if self.prefix else None)

    def matches(self, key: str) -> bool:
        return bool(self.pattern and self.pattern.match(key))


PROVIDERS: dict[str, ProviderInfo] = {
    p.id: p
    for p in (
        ProviderInfo(
            "google",
            "Google Gemini",
            "https://aistudio.google.com/apikey",
            prefix=r"^AIza",
            check_url="https://generativelanguage.googleapis.com/v1beta/models",
            check_header="x-goog-api-key",
            free=True,
            steps=(
                "Sign in with your Google account.",
                "Click “Create API key”.",
                "Copy the key and paste it here.",
            ),
            note="Needs a Google account that is 18 or older. On the free tier, Google may "
            "use what you send to improve its products.",
            hint="AIza",
        ),
        ProviderInfo(
            "groq",
            "Groq",
            "https://console.groq.com/keys",
            prefix=r"^gsk_",
            check_url="https://api.groq.com/openai/v1/models",
            free=True,
            steps=(
                "Sign up with Google, GitHub or email.",
                "Click “Create API Key” and give it any name.",
                "Copy the key and paste it here.",
            ),
            note="Free with daily limits; no card needed.",
            hint="gsk_",
        ),
        ProviderInfo(
            "openrouter",
            "OpenRouter",
            "https://openrouter.ai/settings/keys",
            prefix=r"^sk-or-",
            # Its models list is public, so it accepts any key; this one needs a real key.
            check_url="https://openrouter.ai/api/v1/key",
            free=True,
            steps=(
                "Sign up at OpenRouter.",
                "Click “Create Key”.",
                "Copy the key and paste it here.",
            ),
            note="Free models have a small daily limit (about 50 drafts) unless you add credit.",
            hint="sk-or-",
        ),
        ProviderInfo(
            "anthropic",
            "Anthropic (Claude)",
            "https://platform.claude.com/settings/keys",
            prefix=r"^sk-ant-",
            note="Paid: billed per use by Anthropic.",
            hint="sk-ant-",
        ),
        ProviderInfo(
            "openai",
            "OpenAI",
            "https://platform.openai.com/api-keys",
            prefix=r"^sk-(?!or-|ant-)",
            check_url="https://api.openai.com/v1/models",
            note="Paid: billed per use by OpenAI.",
            hint="sk-",
        ),
        ProviderInfo(
            "mistral",
            "Mistral",
            "https://console.mistral.ai/api-keys",
            check_url="https://api.mistral.ai/v1/models",
            note="Has a free plan with low limits.",
        ),
    )
}


def detect(key: str) -> str | None:
    """The provider a key belongs to, from how it starts; None when it could be anyone's."""
    key = key.strip()
    for p in PROVIDERS.values():
        if p.matches(key):
            return p.id
    return None
