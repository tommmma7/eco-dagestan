import asyncio, random, math, io
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import numpy as np

app = FastAPI(title="Эко-Щит Каспия")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

# ---------- Данные в памяти ----------
BUOYS = [
    {"id": 1, "name": "Дельта Волги-1", "lat": 45.85, "lon": 48.20, "temp": 14.0, "salinity": 3.0, "status": "safe"},
    {"id": 2, "name": "Дельта Волги-2", "lat": 45.60, "lon": 48.60, "temp": 14.5, "salinity": 4.5, "status": "safe"},
    {"id": 3, "name": "Кизлярский залив", "lat": 44.80, "lon": 47.00, "temp": 13.0, "salinity": 9.0, "status": "safe"},
    {"id": 4, "name": "о. Тюлений", "lat": 44.45, "lon": 47.50, "temp": 12.5, "salinity": 11.0, "status": "safe"},
    {"id": 5, "name": "Махачкала", "lat": 42.98, "lon": 47.60, "temp": 13.5, "salinity": 12.0, "status": "safe"},
    {"id": 6, "name": "Аграханский залив", "lat": 43.85, "lon": 47.70, "temp": 13.0, "salinity": 10.0, "status": "safe"},
]
INCIDENTS = []
_next_id = {"v": 1}

# Зоны риска: полигоны фиксированы, риск считается по данным ближайших буев
ZONES = [
    {"id": "zone_1", "name": "Нерест осетра (дельта Волги)", "kind": "spawn",
     "polygon": [[45.5, 48.0], [46.0, 48.0], [46.0, 48.8], [45.5, 48.8]]},
    {"id": "zone_2", "name": "Лежбище тюленя (о. Тюлений)", "kind": "seal",
     "polygon": [[44.2, 47.2], [44.7, 47.2], [44.7, 47.8], [44.2, 47.8]]},
    {"id": "zone_3", "name": "Миграция тюленя (Кизлярский залив)", "kind": "seal",
     "polygon": [[44.5, 46.6], [45.0, 46.6], [45.0, 47.3], [44.5, 47.3]]},
]

# ---------- Вспомогательное ----------
def point_in_polygon(lat, lon, poly):
    inside = False
    n = len(poly)
    for i in range(n):
        y1, x1 = poly[i]
        y2, x2 = poly[(i + 1) % n]
        if (x1 > lon) != (x2 > lon):
            y_cross = (y2 - y1) * (lon - x1) / (x2 - x1) + y1
            if lat < y_cross:
                inside = not inside
    return inside

def nearest_buoy(lat, lon):
    return min(BUOYS, key=lambda b: (b["lat"] - lat) ** 2 + (b["lon"] - lon) ** 2)

def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))

def compute_zones():
    """Простая предиктивная модель: риск зависит от температуры и солёности ближайшего буя."""
    result = []
    for z in ZONES:
        c_lat = sum(p[0] for p in z["polygon"]) / len(z["polygon"])
        c_lon = sum(p[1] for p in z["polygon"]) / len(z["polygon"])
        b = nearest_buoy(c_lat, c_lon)
        if z["kind"] == "spawn":
            # осетр нерестится при +12..16°C и низкой солёности
            t_score = 1 - abs(b["temp"] - 14) / 6
            s_score = 1 - clamp(b["salinity"] / 8)
            risk = clamp(0.6 * t_score + 0.4 * s_score)
            reason = f"Вода {b['temp']:.1f}°C, солёность {b['salinity']:.1f}‰ — благоприятно для нереста"
        else:
            # тюлень: активность растёт при похолодании
            risk = clamp(1 - (b["temp"] - 8) / 10)
            reason = f"Вода {b['temp']:.1f}°C — повышенная активность тюленя"
        result.append({"id": z["id"], "name": z["name"], "polygon": z["polygon"],
                       "risk": round(risk, 2), "reason": reason})
    return result

def zone_hit(lat, lon):
    for z in ZONES:
        if point_in_polygon(lat, lon, z["polygon"]):
            return True
    return False

def add_incident(itype, lat, lon, confidence, message, buoy_id=None):
    in_zone = zone_hit(lat, lon)
    priority = "high" if (in_zone or confidence >= 0.9) else "medium"
    inc = {
        "id": _next_id["v"], "type": itype, "lat": lat, "lon": lon,
        "time": datetime.now().isoformat(timespec="seconds"),
        "confidence": round(confidence, 2),
        "risk_zone": in_zone, "priority": priority,
        "message": message, "status": "Новый", "buoy_id": buoy_id,
    }
    _next_id["v"] += 1
    INCIDENTS.insert(0, inc)
    del INCIDENTS[50:]
    if buoy_id:
        for b in BUOYS:
            if b["id"] == buoy_id:
                b["status"] = "critical"
    return inc

# ---------- Фоновая телеметрия ----------
async def telemetry_loop():
    while True:
        for b in BUOYS:
            b["temp"] = round(clamp(b["temp"] + random.uniform(-0.15, 0.15), 8, 20), 2)
            b["salinity"] = round(clamp(b["salinity"] + random.uniform(-0.1, 0.1), 0.5, 13), 2)
            # критический статус сам возвращается в норму, если нет активных инцидентов
            active = any(i["buoy_id"] == b["id"] and i["status"] == "Новый" for i in INCIDENTS)
            if not active:
                b["status"] = "safe"
        await asyncio.sleep(3)

import threading
from starlette.concurrency import run_in_threadpool

CLF = {"pipe": None, "state": "loading"}
GUN_KEYS = ("gunshot", "gunfire", "machine gun", "fusillade", "cap gun", "explosion", "artillery")
BOAT_KEYS = ("boat", "ship", "motor", "engine", "outboard")

def load_model():
    try:
        from transformers import pipeline
        CLF["pipe"] = pipeline("audio-classification", model="MIT/ast-finetuned-audioset-10-10-0.4593")
        CLF["state"] = "ready"
        print("ИИ-модель звука загружена")
    except Exception as e:
        CLF["state"] = "error"
        print("Модель не загрузилась, работает эвристика:", e)

def classify_ai(y):
    out = CLF["pipe"]({"raw": y.astype("float32"), "sampling_rate": 16000}, top_k=25)
    def best(keys):
        return max([o["score"] for o in out if any(k in o["label"].lower() for k in keys)] or [0.0])
    gun, boat = best(GUN_KEYS), best(BOAT_KEYS)
    if gun >= 0.2 and gun >= boat:
        return "Выстрел", gun
    if boat >= 0.2:
        return "Браконьерский катер", boat
    return "Шум волн/Норма", max(0.6, 1 - max(gun, boat))

@app.on_event("startup")
async def startup():
    asyncio.create_task(telemetry_loop())
    threading.Thread(target=load_model, daemon=True).start()

@app.get("/api/model-status")
def model_status():
    return {"audio_model": CLF["state"]}

# ---------- Эндпоинты ----------
@app.get("/api/state")
def state():
    zones = compute_zones()
    avg_t = sum(b["temp"] for b in BUOYS) / len(BUOYS)
    avg_s = sum(b["salinity"] for b in BUOYS) / len(BUOYS)
    return {"buoys": BUOYS, "incidents": INCIDENTS, "risk_zones": zones,
            "hydrology": {"avg_temp": round(avg_t, 1), "avg_salinity": round(avg_s, 1),
                          "sea_level": -28.3}}

@app.get("/api/risk-zones")
def risk_zones():
    return compute_zones()

@app.get("/api/incidents")
def incidents():
    return INCIDENTS

@app.post("/api/simulate")
def simulate():
    b = random.choice(BUOYS)
    kind = random.choice(["boat", "gunshot", "spill"])
    conf = random.uniform(0.85, 0.98)
    msgs = {
        "boat": f"Обнаружен звук подвесного мотора 250 л.с., вероятность {conf*100:.1f}%",
        "gunshot": f"Зафиксирован выстрел, вероятность {conf*100:.1f}%",
        "spill": "Аномалия солёности — возможный сброс",
    }
    if kind == "spill":
        b["salinity"] = round(b["salinity"] + 3, 2)
    lat = b["lat"] + random.uniform(-0.05, 0.05)
    lon = b["lon"] + random.uniform(-0.05, 0.05)
    return add_incident(kind, round(lat, 4), round(lon, 4), conf, msgs[kind], b["id"])

@app.post("/api/analyze-audio")
async def analyze_audio(file: UploadFile = File(...), buoy_id: int | None = None):
    data = await file.read()
    try:
        import librosa
        y, sr = librosa.load(io.BytesIO(data), sr=16000, mono=True, duration=10)
        if len(y) < 1600:
            raise ValueError("пустой файл")
    except Exception:
        raise HTTPException(400, "Не удалось прочитать аудиофайл")

    spec = np.abs(np.fft.rfft(y))
    freqs = np.fft.rfftfreq(len(y), 1 / sr)
    bands = [float(x.mean()) for x in np.array_split(spec, 32)]
    m = max(bands) or 1
    spectrum = [round(s / m, 3) for s in bands]

    engine = "AST (AudioSet)"
    if CLF["pipe"] is not None:
        label, conf = await run_in_threadpool(classify_ai, y)
    else:
        engine = "эвристика (модель ещё грузится)"
        low = spec[(freqs > 50) & (freqs < 500)].sum()
        mid = spec[(freqs >= 500) & (freqs < 2000)].sum()
        high = spec[freqs >= 2000].sum()
        total = low + mid + high + 1e-9
        peak = float(np.max(np.abs(y)) / (np.mean(np.abs(y)) + 1e-9))
        if peak > 25 and high / total > 0.15:
            label, conf = "Выстрел", 0.80 + 0.15 * min(1, peak / 60)
        elif low / total > 0.55:
            label, conf = "Браконьерский катер", 0.75 + 0.2 * (low / total)
        else:
            label, conf = "Шум волн/Норма", 0.7 + 0.2 * (mid / total)

    conf = min(float(conf), 0.99)
    incident = None
    if label != "Шум волн/Норма":
        b = next((x for x in BUOYS if x["id"] == buoy_id), None) or random.choice(BUOYS)
        kind = "gunshot" if label == "Выстрел" else "boat"
        lat = round(b["lat"] + random.uniform(-0.04, 0.04), 4)
        lon = round(b["lon"] + random.uniform(-0.04, 0.04), 4)
        incident = add_incident(kind, lat, lon, conf, f"ИИ-анализ записи: {label}, уверенность {conf*100:.1f}%", b["id"])
    return {"label": label, "confidence": round(conf * 100, 1), "spectrum": spectrum,
            "engine": engine, "incident": incident}


@app.post("/api/incidents/{incident_id}/dispatch")
def dispatch(incident_id: int):
    for i in INCIDENTS:
        if i["id"] == incident_id:
            i["status"] = "Патруль направлен"
            return i
    raise HTTPException(404, "Инцидент не найден")