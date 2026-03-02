"""
PDF Service — Generate downloadable PDF reports from research results.

Uses fpdf2 (lightweight, pure Python, no system deps).
"""

import logging
from fpdf import FPDF
from datetime import datetime

logger = logging.getLogger(__name__)

_UNICODE_MAP = {
    "\u2014": "--",
    "\u2013": "-",
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2022": "-",
    "\u2026": "...",
    "\u25c6": "-",
    "\u2212": "-",
    "\u00a0": " ",
    "\u200b": "",
    "\u2192": "->",
    "\u2190": "<-",
    "\u2713": "[x]",
    "\u2717": "[ ]",
    "\u00b7": "-",
    "\u2023": ">",
}


def _safe(text) -> str:
    if text is None:
        return ""
    text = str(text)
    for char, repl in _UNICODE_MAP.items():
        text = text.replace(char, repl)
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _str(val, default="") -> str:
    if val is None:
        return default
    return str(val)


def _write_text(pdf: FPDF, height: float, text: str):
    """Safe multi_cell that resets X to left margin first."""
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(w=pdf.epw, h=height, text=text)


def _write_cell(pdf: FPDF, height: float, text: str, **kwargs):
    """Safe cell that resets X to left margin first."""
    pdf.set_x(pdf.l_margin)
    pdf.cell(w=pdf.epw, h=height, text=text, new_x="LMARGIN", new_y="NEXT", **kwargs)


def generate_research_pdf(research: dict) -> bytes:
    idea = _safe(_str(research.get("idea_text"), "Unknown idea"))
    category = _str(research.get("category"), "")
    analysis_type = _str(research.get("analysis_type"), "fast")
    created = _str(research.get("created_at"), "")
    result = research.get("result") or {}
    if not isinstance(result, dict):
        result = {}
    notes = _safe(_str(research.get("notes"), ""))

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # ─── Cover ───
    pdf.set_font("Helvetica", "B", 28)
    _write_cell(pdf, 20, "ShipOrSkip", align="C")

    pdf.set_font("Helvetica", "I", 12)
    pdf.set_text_color(120, 120, 120)
    _write_cell(pdf, 8, "Idea Validation Report", align="C")

    pdf.ln(10)
    pdf.set_draw_color(220, 220, 220)
    pdf.line(20, pdf.get_y(), 190, pdf.get_y())
    pdf.ln(10)

    # ─── Idea ───
    pdf.set_text_color(0, 0, 0)
    _section_header(pdf, "Idea")
    pdf.set_font("Helvetica", "", 11)
    _write_text(pdf, 6, idea)
    pdf.ln(3)

    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(120, 120, 120)
    meta_parts = [f"Type: {analysis_type.title()}"]
    if category:
        meta_parts.append(f"Category: {_safe(category)}")
    if created:
        try:
            dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            meta_parts.append(f"Date: {dt.strftime('%B %d, %Y')}")
        except Exception:
            pass
    _write_cell(pdf, 5, " | ".join(meta_parts))
    pdf.ln(8)

    # ─── Verdict ───
    verdict = _safe(_str(result.get("verdict")))
    if verdict:
        _section_header(pdf, "Verdict")
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(0, 0, 0)
        _write_text(pdf, 6, verdict)
        pdf.ln(6)

    # ─── Competitors ───
    competitors = result.get("competitors") or []
    for i, c in enumerate(competitors):
        if not isinstance(c, dict):
            continue
        if i == 0:
            _section_header(pdf, f"Similar Products ({len(competitors)})")

        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(0, 0, 0)
        name = _safe(_str(c.get("name"), f"Competitor {i+1}"))
        threat = _str(c.get("threat_level"))
        label = name + (f"  [{threat} threat]" if threat else "")
        _write_cell(pdf, 6, label)

        desc = _safe(_str(c.get("description")))
        if desc:
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(80, 80, 80)
            _write_text(pdf, 5, desc)

        diff = _safe(_str(c.get("differentiator")))
        if diff:
            pdf.set_font("Helvetica", "I", 9)
            pdf.set_text_color(100, 100, 100)
            _write_text(pdf, 5, f"Gap: {diff}")

        url = _safe(_str(c.get("url")))
        if url:
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(60, 100, 180)
            _write_cell(pdf, 5, url)

        pdf.ln(3)

    # ─── Market Gaps ───
    gaps = result.get("gaps") or []
    if gaps:
        _section_header(pdf, "Market Gaps")
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(0, 0, 0)
        for g in gaps:
            _write_text(pdf, 6, _safe(f"*  {_str(g)}"))
        pdf.ln(4)

    # ─── Pros ───
    pros = result.get("pros") or []
    if pros:
        _section_header(pdf, "Strengths")
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(45, 106, 79)
        for p in pros:
            _write_text(pdf, 6, _safe(f"+  {_str(p)}"))
        pdf.ln(4)

    # ─── Cons ───
    cons = result.get("cons") or []
    if cons:
        _section_header(pdf, "Weaknesses")
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(230, 57, 70)
        for c in cons:
            _write_text(pdf, 6, _safe(f"-  {_str(c)}"))
        pdf.ln(4)

    # ─── Build Plan ───
    build_plan = result.get("build_plan") or []
    if build_plan:
        _section_header(pdf, "Build Plan")
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(0, 0, 0)
        for i, step in enumerate(build_plan):
            _write_text(pdf, 6, _safe(f"{str(i+1).zfill(2)}.  {_str(step)}"))
        pdf.ln(4)

    # ─── Notes ───
    if notes:
        _section_header(pdf, "Your Notes")
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(0, 0, 0)
        _write_text(pdf, 6, notes)
        pdf.ln(4)

    # ─── Footer ───
    pdf.ln(10)
    pdf.set_draw_color(220, 220, 220)
    pdf.line(20, pdf.get_y(), 190, pdf.get_y())
    pdf.ln(5)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(150, 150, 150)
    _write_cell(pdf, 5, "Generated by ShipOrSkip -- shiporskip.com", align="C")

    return pdf.output()


def _section_header(pdf: FPDF, title: str):
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(10, 10, 46)
    pdf.set_x(pdf.l_margin)
    pdf.cell(w=0, h=10, text=title, new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(230, 69, 96)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + 40, pdf.get_y())
    pdf.ln(4)
