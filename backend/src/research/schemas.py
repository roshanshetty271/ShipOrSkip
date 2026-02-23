from pydantic import BaseModel, Field
from typing import Optional

class AnalyzeRequest(BaseModel):
    idea: str = Field(..., max_length=500)
    category: Optional[str] = None
    turnstile_token: Optional[str] = None

class Competitor(BaseModel):
    name: str
    url: str = ""
    description: str
    differentiator: str = ""
    threat_level: str = "medium"

class AnalysisResult(BaseModel):
    competitors: list[Competitor] = []
    pros: list[str] = []
    cons: list[str] = []
    market_saturation: str = "medium"
    gaps: list[str] = []
    verdict: str = ""
    build_plan: list[str] = []
