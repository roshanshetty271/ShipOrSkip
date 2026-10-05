import pytest
from pydantic import ValidationError

from src.research.pdf_service import generate_research_pdf
from src.research.schemas import AnalysisResult, Competitor


def test_enum_fields_default_to_medium():
    assert AnalysisResult().market_saturation == "medium"
    assert Competitor(name="A", description="b").threat_level == "medium"


@pytest.mark.parametrize("value", ["High", "unknown", "very high", ""])
def test_enum_fields_reject_other_values(value):
    with pytest.raises(ValidationError):
        AnalysisResult(market_saturation=value)
    with pytest.raises(ValidationError):
        Competitor(name="A", description="b", threat_level=value)


@pytest.mark.parametrize("saturation", ["high", "unknown", None])
def test_pdf_renders_with_any_stored_saturation(saturation):
    research = {
        "idea_text": "habit tracker", "analysis_type": "fast", "created_at": "2026-10-01T10:00:00+00:00",
        "result": {"verdict": "Build it.", "market_saturation": saturation,
                   "competitors": [{"name": "Habitica", "threat_level": "High", "description": "RPG"}]},
    }
    assert bytes(generate_research_pdf(research)).startswith(b"%PDF")
