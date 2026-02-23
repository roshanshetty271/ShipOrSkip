from pydantic import BaseModel, EmailStr
from typing import Optional


class UserProfile(BaseModel):
    id: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    tier: str = "free"
    deep_research_count: int = 0
