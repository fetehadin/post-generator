"""Resume and portfolio text: reading files, removing contacts, fetching only public pages
(FR-20, FR-21, NFR-12). No database, no network."""

import io

import httpx
import pytest
from docx import Document

from app.services import uploads
from app.services.uploads import UploadError, check_url, fetch_page, resume_text, strip_contacts


def make_docx(*lines: str) -> bytes:
    doc = Document()
    for line in lines:
        doc.add_paragraph(line)
    out = io.BytesIO()
    doc.save(out)
    return out.getvalue()


def make_pdf(text: str) -> bytes:
    """A one-page PDF with one line of text, built by hand so tests need no PDF writer."""
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, 1):
        offsets.append(out.tell())
        out.write(b"%d 0 obj\n" % i + body + b"\nendobj\n")
    xref = out.tell()
    out.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1))
    for o in offsets:
        out.write(b"%010d 00000 n \n" % o)
    out.write(b"trailer\n<< /Size %d /Root 1 0 R >>\n" % (len(objects) + 1))
    out.write(b"startxref\n%d\n%%%%EOF\n" % xref)
    return out.getvalue()


# ---- files


def test_a_docx_resume_becomes_text():
    assert "Backend developer" in resume_text(make_docx("Backend developer", "Python"))


def test_a_pdf_resume_becomes_text():
    assert "Backend developer" in resume_text(make_pdf("Backend developer at Gebeta"))


def test_other_files_are_refused_with_a_readable_message():
    with pytest.raises(UploadError) as e:
        resume_text(b"just some text")
    assert e.value.code == "invalid_file" and "PDF" in e.value.message


def test_a_file_over_5_mb_is_refused():
    with pytest.raises(UploadError) as e:
        resume_text(b"%PDF" + b"0" * uploads.MAX_FILE_BYTES)
    assert e.value.code == "invalid_file"


def test_a_broken_pdf_is_refused():
    with pytest.raises(UploadError) as e:
        resume_text(b"%PDF-1.4 broken")
    assert e.value.code in ("invalid_file", "no_text")


# ---- contacts (FR-21)


def test_emails_phones_and_address_lines_are_removed_and_counted():
    text = (
        "Abebe Kebede\n"
        "abebe.k@example.com | +251 91 123 4567\n"
        "Bole Sub-city, Woreda 3, House No. 12\n"
        "221B Baker Street\n"
        "Backend developer since 2021, shipped 3 apps\n"
        "Call (555) 123-4567"
    )
    cleaned, removed = strip_contacts(text)
    assert "@" not in cleaned and "4567" not in cleaned
    assert "Woreda" not in cleaned and "Baker" not in cleaned
    assert "Backend developer since 2021, shipped 3 apps" in cleaned
    assert removed == {"emails": 1, "phones": 2, "addresses": 2}


def test_years_and_short_numbers_are_kept():
    cleaned, removed = strip_contacts("2019–2023 at Gebeta, 40 users, v2.1")
    assert cleaned == "2019–2023 at Gebeta, 40 users, v2.1" and removed == {}


# ---- public addresses only (NFR-12)


@pytest.fixture
def dns(monkeypatch):
    """Pretend DNS: name → address."""
    table = {"me.dev": "93.184.216.34", "evil.dev": "127.0.0.1", "inside.dev": "10.0.0.5"}

    def fake(host, *_a, **_k):
        if host not in table:
            raise uploads.socket.gaierror
        return [(None, None, None, "", (table[host], 0))]

    monkeypatch.setattr(uploads.socket, "getaddrinfo", fake)


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost/",
        "http://127.0.0.1/",
        "http://169.254.169.254/latest/meta-data",  # cloud metadata
        "https://evil.dev/",  # a public name pointing at localhost
        "https://inside.dev/",
        "https://me.dev:8080/",
        "https://user:pw@me.dev/",
        "ftp://me.dev/",
        "me.dev",
        "https://nowhere.dev/",
    ],
)
def test_non_public_or_odd_addresses_are_refused(dns, url):
    with pytest.raises(UploadError) as e:
        check_url(url)
    assert e.value.code == "invalid_url"


def test_a_public_address_is_accepted(dns):
    assert check_url(" https://me.dev/about ") == "https://me.dev/about"


def client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=False)


def test_a_page_becomes_visible_text_only(dns):
    html = (
        "<html><head><title>x</title><style>p{}</style></head><body>"
        "<h1>Hi, I'm Sara</h1><script>steal()</script><p>I build apps</p></body></html>"
    )
    page = fetch_page(
        "https://me.dev/",
        client(lambda r: httpx.Response(200, text=html, headers={"content-type": "text/html"})),
    )
    assert "Hi, I'm Sara" in page and "I build apps" in page
    assert "steal" not in page and "p{}" not in page


def test_a_redirect_to_a_private_address_is_refused(dns):
    def handler(request):
        return httpx.Response(302, headers={"location": "http://127.0.0.1/admin"})

    with pytest.raises(UploadError) as e:
        fetch_page("https://me.dev/", client(handler))
    assert e.value.code == "invalid_url"


def test_too_many_redirects_stop(dns):
    with pytest.raises(UploadError) as e:
        fetch_page(
            "https://me.dev/", client(lambda r: httpx.Response(302, headers={"location": "/x"}))
        )
    assert e.value.code == "fetch_failed"


def test_a_non_page_is_refused(dns):
    def handler(request):
        return httpx.Response(200, content=b"\x00", headers={"content-type": "image/png"})

    with pytest.raises(UploadError) as e:
        fetch_page("https://me.dev/", client(handler))
    assert e.value.code == "fetch_failed"


def test_an_error_page_is_refused(dns):
    with pytest.raises(UploadError) as e:
        fetch_page("https://me.dev/", client(lambda r: httpx.Response(404)))
    assert e.value.code == "fetch_failed"


# ---- review findings (PR #49)


@pytest.mark.parametrize(
    "text",
    [
        "Mail: sara [at] example (dot) com",
        "sara (at) gmail dot com",
        "sara at gmail dot com",
        "first.last＠gmail.com",  # full-width @
    ],
)
def test_hidden_emails_are_removed(text):
    cleaned, removed = strip_contacts(text)
    assert "gmail" not in cleaned and "example" not in cleaned
    assert removed == {"emails": 1}


@pytest.mark.parametrize(
    "text", ["Chat: wa.me/251911234567", "tel:+251911234567", "Call 5551234567x89 today"]
)
def test_phones_in_links_and_with_extensions_are_removed(text):
    cleaned, removed = strip_contacts(text)
    assert "1234567" not in cleaned and "x89" not in cleaned
    assert removed == {"phones": 1}


def test_lines_that_only_look_like_addresses_are_kept():
    text = "Built 5 Drive integrations for Google\nShipped 3 Way handshake support"
    assert strip_contacts(text) == (text, {})


def test_a_long_line_loses_only_the_address():
    line = "I led the backend team " * 6 + "at 221B Baker Street and shipped the payments service"
    cleaned, removed = strip_contacts(line)
    assert "Baker" not in cleaned and "shipped the payments service" in cleaned
    assert removed == {"addresses": 1}


@pytest.mark.parametrize("url", ["http://x.com:abc/", "http://me.dev:99999/", "http://[::1/"])
def test_malformed_addresses_are_refused_not_crashed(dns, url):
    with pytest.raises(UploadError) as e:
        check_url(url)
    assert e.value.code == "invalid_url"


def test_the_fetch_connects_to_the_checked_address(dns):
    seen = []

    def handler(request):
        seen.append((str(request.url), request.headers["host"], request.extensions))
        return httpx.Response(200, text="hi", headers={"content-type": "text/plain"})

    fetch_page("https://me.dev/about", client(handler))
    url, host, extensions = seen[0]
    assert url == "https://93.184.216.34/about" and host == "me.dev"
    assert extensions["sni_hostname"] == "me.dev"  # the certificate is checked for me.dev


def test_a_slow_page_stops_at_the_deadline(dns, monkeypatch):
    monkeypatch.setattr(uploads, "FETCH_DEADLINE", -1)
    with pytest.raises(UploadError) as e:
        fetch_page(
            "https://me.dev/",
            client(lambda r: httpx.Response(200, text="x", headers={"content-type": "text/html"})),
        )
    assert "too long" in e.value.message


def test_a_docx_that_unzips_huge_is_refused(monkeypatch):
    monkeypatch.setattr(uploads, "MAX_UNZIPPED_BYTES", 1000)
    with pytest.raises(UploadError) as e:
        resume_text(make_docx("Backend developer"))
    assert e.value.code == "invalid_file"
