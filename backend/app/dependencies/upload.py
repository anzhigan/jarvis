from fastapi import UploadFile, HTTPException, status
from typing import List, Optional
import os
import uuid
import shutil
from datetime import datetime

from app.core.config import settings
from fastapi import Depends

class FileUploadHandler:
    """
    Обработчик загрузки файлов
    """

    def __init__(self, upload_dir: str = None):
        self.upload_dir = upload_dir or settings.UPLOAD_DIR
        self.allowed_extensions = settings.ALLOWED_EXTENSIONS
        self.max_file_size = settings.MAX_FILE_SIZE

    def validate_file(
            self,
            file: UploadFile,
            allowed_extensions: Optional[set] = None,
            max_size: Optional[int] = None
    ) -> None:
        """
        Валидация загружаемого файла
        """
        # Проверяем размер файла
        max_size_bytes = max_size or self.max_file_size
        file.file.seek(0, 2)  # Перемещаемся в конец файла
        file_size = file.file.tell()
        file.file.seek(0)  # Возвращаемся в начало

        if file_size > max_size_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large. Maximum size: {max_size_bytes / 1024 / 1024:.1f}MB"
            )

        # Проверяем расширение файла
        file_extension = os.path.splitext(file.filename)[1].lower()
        allowed = allowed_extensions or self.allowed_extensions

        if allowed and file_extension not in allowed:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"File type {file_extension} not allowed. Allowed: {', '.join(allowed)}"
            )

    def generate_filename(self, original_filename: str, prefix: str = "") -> str:
        """
        Генерация уникального имени файла
        """
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
            validate: bool = True
    ) -> str:
        """
        Сохранение загруженного файла на диск

        Returns:
            Относительный путь к сохраненному файлу
        """
        if validate:
            self.validate_file(file)

        # Создаем директорию, если её нет
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
        relative_path = os.path.join(subdirectory, filename) if subdirectory else filename
        return relative_path

    async def save_multiple_files(
            self,
            files: List[UploadFile],
            subdirectory: str = "",
            validate: bool = True
    ) -> List[str]:
        """
        Сохранение нескольких файлов
        """
        saved_paths = []

        for file in files:
            file_path = await self.save_file(file, subdirectory, validate=validate)
            saved_paths.append(file_path)

        return saved_paths

    def delete_file(self, file_path: str) -> bool:
        """
        Удаление файла с диска
        """
        full_path = os.path.join(self.upload_dir, file_path)

        if os.path.exists(full_path):
            os.remove(full_path)
            return True

        return False

    def get_file_url(self, file_path: str) -> str:
        """
        Получить URL для доступа к файлу
        """
        return f"/uploads/{file_path}"


# Глобальный экземпляр обработчика файлов
file_upload_handler = FileUploadHandler()


async def validate_file_upload(
        file: UploadFile,
        allowed_extensions: Optional[set] = None,
        max_size: Optional[int] = None
) -> UploadFile:
    """
    Dependency для валидации загружаемого файла

    Использование:
        @router.post("/upload")
        async def upload_file(file: UploadFile = Depends(validate_file_upload)):
            # file уже валидирован
            pass
    """
    file_upload_handler.validate_file(file, allowed_extensions, max_size)
    return file


def get_file_upload_handler() -> FileUploadHandler:
    """
    Dependency для получения обработчика файлов

    Использование:
        @router.post("/upload")
        async def upload_file(
            file: UploadFile,
            upload_handler: FileUploadHandler = Depends(get_file_upload_handler)
        ):
            path = await upload_handler.save_file(file, "notes")
            return {"path": path}
    """
    return file_upload_handler


# Вспомогательные функции для разных типов файлов

async def save_note_image(
        file: UploadFile,
        note_id: str,
        upload_handler: FileUploadHandler = Depends(get_file_upload_handler)
) -> str:
    """
    Сохранить изображение для заметки
    """
    subdirectory = f"notes/{note_id}"
    filename = upload_handler.generate_filename(file.filename, prefix="img")

    relative_path = await upload_handler.save_file(
        file,
        subdirectory=subdirectory,
        filename=filename
    )

    return upload_handler.get_file_url(relative_path)


async def save_task_attachment(
        file: UploadFile,
        task_id: str,
        upload_handler: FileUploadHandler = Depends(get_file_upload_handler)
) -> str:
    """
    Сохранить вложение для задачи
    """
    subdirectory = f"tasks/{task_id}"
    filename = upload_handler.generate_filename(file.filename, prefix="att")

    relative_path = await upload_handler.save_file(
        file,
        subdirectory=subdirectory,
        filename=filename
    )

    return upload_handler.get_file_url(relative_path)


async def save_user_avatar(
        file: UploadFile,
        user_id: str,
        upload_handler: FileUploadHandler = Depends(get_file_upload_handler)
) -> str:
    """
    Сохранить аватар пользователя
    """
    subdirectory = f"avatars/{user_id}"
    filename = upload_handler.generate_filename(file.filename, prefix="avatar")

    relative_path = await upload_handler.save_file(
        file,
        subdirectory=subdirectory,
        filename=filename,
        validate=True
    )

    return upload_handler.get_file_url(relative_path)