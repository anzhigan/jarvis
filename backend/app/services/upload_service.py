import os
import uuid
import shutil
from typing import List, Optional
from fastapi import UploadFile, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings


class UploadService:
    """
    Сервис для загрузки и управления файлами
    """

    def __init__(self, db: Session = None):
        self.db = db
        self.upload_dir = settings.UPLOAD_DIR
        self.allowed_extensions = settings.ALLOWED_EXTENSIONS
        self.max_file_size = settings.MAX_FILE_SIZE

    def validate_file(
            self,
            file: UploadFile,
            allowed_extensions: Optional[set] = None,
            max_size: Optional[int] = None
    ) -> None:
        """Валидация файла"""
        # Проверяем размер
        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)

        max_size_bytes = max_size or self.max_file_size
        if file_size > max_size_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large. Max size: {max_size_bytes / 1024 / 1024:.1f}MB"
            )

        # Проверяем расширение
        file_extension = os.path.splitext(file.filename)[1].lower()
        allowed = allowed_extensions or self.allowed_extensions

        if file_extension not in allowed:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"File type '{file_extension}' not allowed. Allowed: {', '.join(allowed)}"
            )

    def generate_filename(self, original_filename: str, prefix: str = "") -> str:
        """Генерация уникального имени файла"""
        file_extension = os.path.splitext(original_filename)[1].lower()
        unique_id = str(uuid.uuid4())

        if prefix:
            return f"{prefix}_{unique_id}{file_extension}"
        return f"{unique_id}{file_extension}"

    async def save_file(
            self,
            file: UploadFile,
            subdirectory: str = "",
            filename: Optional[str] = None,
            validate: bool = True,
            allowed_extensions: Optional[set] = None,
            max_size: Optional[int] = None
    ) -> str:
        """
        Сохранить файл на диск

        Returns:
            Относительный путь к файлу
        """
        if validate:
            self.validate_file(file, allowed_extensions, max_size)

        # Создаем директорию
        upload_path = os.path.join(self.upload_dir, subdirectory)
        os.makedirs(upload_path, exist_ok=True)

        # Генерируем имя файла
        if not filename:
            filename = self.generate_filename(file.filename)

        # Сохраняем файл
        file_path = os.path.join(upload_path, filename)

        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save file: {str(e)}"
            )

        # Возвращаем относительный путь
        if subdirectory:
            return os.path.join(subdirectory, filename)
        return filename

    async def save_multiple_files(
            self,
            files: List[UploadFile],
            subdirectory: str = "",
            validate: bool = True
    ) -> List[str]:
        """Сохранить несколько файлов"""
        saved_paths = []

        for file in files:
            path = await self.save_file(file, subdirectory, validate=validate)
            saved_paths.append(path)

        return saved_paths

    def delete_file(self, file_path: str) -> bool:
        """Удалить файл с диска"""
        full_path = os.path.join(self.upload_dir, file_path)

        if os.path.exists(full_path):
            os.remove(full_path)
            return True

        return False

    def get_file_url(self, file_path: str) -> str:
        """Получить URL для доступа к файлу"""
        return f"/uploads/{file_path}"

    def get_full_path(self, file_path: str) -> str:
        """Получить полный путь к файлу на диске"""
        return os.path.join(self.upload_dir, file_path)

    def file_exists(self, file_path: str) -> bool:
        """Проверить, существует ли файл"""
        full_path = self.get_full_path(file_path)
        return os.path.exists(full_path)

    def get_file_size(self, file_path: str) -> int:
        """Получить размер файла в байтах"""
        full_path = self.get_full_path(file_path)
        if os.path.exists(full_path):
            return os.path.getsize(full_path)
        return 0

    # ========== SPECIFIC UPLOADS ==========

    async def save_note_image(
            self,
            file: UploadFile,
            note_id: str
    ) -> str:
        """Сохранить изображение для заметки"""
        subdirectory = f"notes/{note_id}"
        filename = self.generate_filename(file.filename, prefix="img")

        relative_path = await self.save_file(
            file,
            subdirectory=subdirectory,
            filename=filename
        )

        return self.get_file_url(relative_path)

    async def save_task_attachment(
            self,
            file: UploadFile,
            task_id: str
    ) -> str:
        """Сохранить вложение для задачи"""
        subdirectory = f"tasks/{task_id}"
        filename = self.generate_filename(file.filename, prefix="att")

        relative_path = await self.save_file(
            file,
            subdirectory=subdirectory,
            filename=filename
        )

        return self.get_file_url(relative_path)

    async def save_user_avatar(
            self,
            file: UploadFile,
            user_id: str
    ) -> str:
        """Сохранить аватар пользователя"""
        subdirectory = f"avatars/{user_id}"
        filename = self.generate_filename(file.filename, prefix="avatar")

        relative_path = await self.save_file(
            file,
            subdirectory=subdirectory,
            filename=filename,
            allowed_extensions={".jpg", ".jpeg", ".png", ".webp"},
            max_size=5 * 1024 * 1024  # 5MB для аватаров
        )

        return self.get_file_url(relative_path)

    # ========== CLEANUP ==========

    def cleanup_old_files(self, days: int = 30) -> Dict[str, Any]:
        """Удалить старые файлы"""
        deleted = 0
        deleted_size = 0
        cutoff_time = datetime.utcnow() - timedelta(days=days)

        for root, dirs, files in os.walk(self.upload_dir):
            for file in files:
                file_path = os.path.join(root, file)
                mtime = datetime.fromtimestamp(os.path.getmtime(file_path))

                if mtime < cutoff_time:
                    file_size = os.path.getsize(file_path)
                    os.remove(file_path)
                    deleted += 1
                    deleted_size += file_size

        return {
            "deleted_files": deleted,
            "deleted_size_bytes": deleted_size,
            "deleted_size_mb": round(deleted_size / 1024 / 1024, 2)
        }