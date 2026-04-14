# app/main.py
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.api import notes, tasks, metrics

app = FastAPI(title="Jarvis API")

# Подключаем статические файлы для загруженных изображений
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Подключаем роутеры
app.include_router(notes.router)
app.include_router(tasks.router)
app.include_router(metrics.router)

@app.get("/")
def root():
    return {"message": "Jarvis API is running"}