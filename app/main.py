from fastapi import FastAPI

import app.models  # noqa: F401 — registers all models with Base.metadata
from app.database import Base, engine

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Accounting Tool", version="0.1.0")


@app.get("/health")
def health_check():
    return {"status": "ok"}
