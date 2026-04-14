# scripts/seed_data.py
from app.db.session import SessionLocal
from app.models.note import NoteArea, NoteFolder, NoteFile
from app.models.task import Task, PriorityEnum
from datetime import date, timedelta


def seed():
    db = SessionLocal()

    # Создаем области знаний
    areas = ["Career", "Science", "EQ"]
    for area_name in areas:
        area = NoteArea(name=area_name)
        db.add(area)
        db.flush()

        # Добавляем папки и файлы для Career
        if area_name == "Career":
            folders = ["ML", "DE"]
            for folder_name in folders:
                folder = NoteFolder(name=folder_name, area_id=area.id)
                db.add(folder)
                db.flush()

                files = ["PyTorch", "Pandas"] if folder_name == "ML" else ["Postgres", "Trino"]
                for file_name in files:
                    file = NoteFile(name=file_name, folder_id=folder.id)
                    db.add(file)

    # Создаем тестовые задачи
    today = date.today()
    tasks = [
        Task(title="Complete project documentation", start_date=today, end_date=today + timedelta(days=4),
             priority=PriorityEnum.HIGH),
        Task(title="Review design mockups", start_date=today, end_date=today + timedelta(days=1),
             priority=PriorityEnum.MEDIUM, status="done", completed_at=datetime.now()),
        Task(title="Prepare presentation slides", start_date=today + timedelta(days=1),
             end_date=today + timedelta(days=5), priority=PriorityEnum.HIGH),
        Task(title="Update API documentation", start_date=today, end_date=today + timedelta(days=4),
             priority=PriorityEnum.LOW),
    ]

    for task in tasks:
        db.add(task)

    db.commit()
    print("✅ Seed data added successfully!")


if __name__ == "__main__":
    seed()