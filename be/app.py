from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import cv2
import numpy as np
import traceback
import sys
import time
from datetime import datetime
from orca_ocr.engine import extract, get_rapidocr_status

app = FastAPI(title="ORCA OCR API", version="0.2.11")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3040", "http://127.0.0.1:3040"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    try:
        status = get_rapidocr_status()
        ok = status.get("ready") is True
        return {"ok": ok, "service": "orca-ocr", "version": "0.2.11", "rapidocr": status}
    except Exception as exc:
        return {"ok": False, "service": "orca-ocr", "version": "0.2.11", "rapidocr_error": str(exc)}

@app.post("/extract")
async def extract_image(screen_type: str = Form(...), file: UploadFile = File(...)):
    request_time = datetime.now().isoformat(timespec="seconds")
    filename = file.filename or "(unknown)"
    print(f"\n[ORCA OCR] {request_time} /extract start | type={screen_type} | file={filename}", flush=True)

    if screen_type not in {"summary", "team", "personal", "replay"}:
        print(f"[ORCA OCR] invalid screen_type: {screen_type}", file=sys.stderr, flush=True)
        raise HTTPException(400, "screen_type must be summary/team/personal/replay")

    try:
        raw = await file.read()
        print(f"[ORCA OCR] received {len(raw):,} bytes", flush=True)
        img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("OpenCV could not decode the uploaded image")

        h, w = img.shape[:2]
        print(f"[ORCA OCR] decoded image: {w}x{h}", flush=True)
        t0 = time.perf_counter()
        print(f"[ORCA OCR] extracting {screen_type}...", flush=True)
        result = extract(img, screen_type)
        elapsed = time.perf_counter() - t0
        print(f"[ORCA OCR] SUCCESS | type={screen_type} | file={filename} | elapsed={elapsed:.1f}s", flush=True)
        return result

    except Exception as exc:
        print("\n" + "=" * 78, file=sys.stderr, flush=True)
        print("[ORCA OCR] EXTRACT FAILED", file=sys.stderr, flush=True)
        print(f"time        : {request_time}", file=sys.stderr, flush=True)
        print(f"screen_type : {screen_type}", file=sys.stderr, flush=True)
        print(f"filename    : {filename}", file=sys.stderr, flush=True)
        print(f"error type  : {type(exc).__name__}", file=sys.stderr, flush=True)
        print(f"error       : {exc}", file=sys.stderr, flush=True)
        print("--- full traceback ---", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        print("=" * 78 + "\n", file=sys.stderr, flush=True)
        raise HTTPException(
            status_code=500,
            detail=f"{type(exc).__name__}: {exc}",
        ) from exc
