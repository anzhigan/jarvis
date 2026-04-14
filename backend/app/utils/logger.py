import logging
import sys
from typing import Optional
from datetime import datetime
from pathlib import Path

from app.core.config import settings

# Глобальный логгер
_logger: Optional[logging.Logger] = None


def setup_logger(
        name: str = "jarvis",
        log_file: Optional[str] = None,
        log_level: Optional[str] = None,
        format_str: Optional[str] = None
) -> logging.Logger:
    """
    Настройка логгера
    """
    global _logger

    if _logger is not None:
        return _logger

    # Создаем логгер
    logger = logging.getLogger(name)

    # Устанавливаем уровень логирования
    level = log_level or settings.LOG_LEVEL
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Создаем форматтер
    if format_str is None:
        format_str = settings.LOG_FORMAT

    formatter = logging.Formatter(format_str)

    # Добавляем вывод в консоль
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # Добавляем вывод в файл
    if log_file or settings.LOG_FILE:
        file_path = log_file or settings.LOG_FILE
        if file_path:
            # Создаем директорию для логов
            Path(file_path).parent.mkdir(parents=True, exist_ok=True)

            file_handler = logging.FileHandler(file_path, encoding='utf-8')
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)

    _logger = logger
    return logger


def get_logger() -> logging.Logger:
    """
    Получение логгера
    """
    global _logger
    if _logger is None:
        _logger = setup_logger()
    return _logger


def log_error(
        message: str,
        exc_info: Optional[Exception] = None,
        extra: Optional[dict] = None
) -> None:
    """
    Логирование ошибки
    """
    logger = get_logger()
    logger.error(message, exc_info=exc_info, extra=extra or {})


def log_info(message: str, extra: Optional[dict] = None) -> None:
    """
    Логирование информации
    """
    logger = get_logger()
    logger.info(message, extra=extra or {})


def log_warning(message: str, extra: Optional[dict] = None) -> None:
    """
    Логирование предупреждения
    """
    logger = get_logger()
    logger.warning(message, extra=extra or {})


def log_debug(message: str, extra: Optional[dict] = None) -> None:
    """
    Логирование отладочной информации
    """
    logger = get_logger()
    logger.debug(message, extra=extra or {})


class RequestLogger:
    """
    Логгер для HTTP запросов
    """

    def __init__(self, logger: Optional[logging.Logger] = None):
        self.logger = logger or get_logger()

    def log_request(
            self,
            method: str,
            url: str,
            status_code: int,
            duration_ms: float,
            client_ip: Optional[str] = None
    ) -> None:
        """
        Логирование HTTP запроса
        """
        log_data = {
            "method": method,
            "url": url,
            "status_code": status_code,
            "duration_ms": round(duration_ms, 2),
            "client_ip": client_ip,
            "timestamp": datetime.utcnow().isoformat(),
        }

        if status_code >= 500:
            self.logger.error(f"Request failed: {log_data}")
        elif status_code >= 400:
            self.logger.warning(f"Request warning: {log_data}")
        else:
            self.logger.info(f"Request success: {log_data}")


class PerformanceLogger:
    """
    Логгер для производительности
    """

    def __init__(self, logger: Optional[logging.Logger] = None):
        self.logger = logger or get_logger()

    def log_performance(
            self,
            operation: str,
            duration_ms: float,
            metadata: Optional[dict] = None
    ) -> None:
        """
        Логирование производительности операции
        """
        log_data = {
            "operation": operation,
            "duration_ms": round(duration_ms, 2),
            "metadata": metadata or {},
            "timestamp": datetime.utcnow().isoformat(),
        }

        if duration_ms > 1000:  # Более 1 секунды
            self.logger.warning(f"Slow operation: {log_data}")
        else:
            self.logger.debug(f"Performance: {log_data}")


# Создаем глобальные экземпляры
request_logger = RequestLogger()
performance_logger = PerformanceLogger()