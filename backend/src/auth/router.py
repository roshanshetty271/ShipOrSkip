from fastapi import APIRouter

router = APIRouter()

@router.get("/me")
async def get_me():
    # TODO: Verify JWT from Supabase and return user profile
    return {"user": None, "message": "Auth not yet configured"}
