import pytest

from app.generator.attachments import extract_text, readable


def text_pdf(text: str) -> bytes:
    """A minimal one-page PDF showing `text`."""
    stream = f"BT /F1 12 Tf 10 50 Td ({text}) Tj ET".encode()
    objects = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R"
        b"/Resources<</Font<</F1 5 0 R>>>>>>",
        b"<</Length %d>>stream\n%s\nendstream" % (len(stream), stream),
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ]
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf += b"%d 0 obj%s endobj\n" % (number, body)
    xref = len(pdf)
    pdf += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    pdf += b"".join(b"%010d 00000 n \n" % offset for offset in offsets)
    pdf += b"trailer<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF" % (len(objects) + 1, xref)
    return bytes(pdf)


def test_readable() -> None:
    assert all(readable(name) for name in ["a.txt", "b.MD", "c.csv", "d.PDF"])
    assert not any(readable(name) for name in ["e.png", "f.jpg", "g"])


def test_extract_text() -> None:
    assert extract_text("a.txt", "Grüße\n".encode(), 100) == "Grüße\n"
    assert extract_text("a.txt", b"\xff ok", 100) == "� ok"  # not UTF-8: still read
    assert extract_text("a.md", b"abcdef", 3) == "abc"
    assert extract_text("p.pdf", text_pdf("Ribosomes build proteins"), 100) == (
        "Ribosomes build proteins"
    )
    assert extract_text("i.png", b"\x89PNG", 100) == ""


def test_extract_text_rejects_broken_pdfs() -> None:
    with pytest.raises(Exception):  # noqa: B017  # the caller skips any failure
        extract_text("p.pdf", b"not a pdf", 100)
