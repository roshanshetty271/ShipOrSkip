from pydantic import BaseModel, Field
from typing import Literal, Optional


class AnalyzeRequest(BaseModel):
    idea: str = Field(..., max_length=500)
    category: Optional[str] = None
    turnstile_token: Optional[str] = None


class Competitor(BaseModel):
    name: str
    url: str = ""
    description: str
    differentiator: str = ""
    threat_level: Literal["low", "medium", "high"] = "medium"


class AnalysisResult(BaseModel):
    competitors: list[Competitor] = []
    pros: list[str] = []
    cons: list[str] = []
    market_saturation: Literal["low", "medium", "high"] = "medium"
    gaps: list[str] = []
    verdict: str = ""
    build_plan: list[str] = []


class ResearchRecord(BaseModel):
    id: Optional[str] = None
    idea_text: str
    category: Optional[str] = None
    analysis_type: str
    result: Optional[dict] = None
    status: str = "completed"
    created_at: Optional[str] = None
