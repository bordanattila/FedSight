from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routes.states import router as states_router

app = FastAPI(
    title="FedSight API",
    description="FEMA-style regional risk analysis for disaster declarations and hurricane exposure.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(states_router)


@app.get("/health")
def health():
    return {"status": "ok"}
