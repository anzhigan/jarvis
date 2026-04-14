from fastapi import Request, HTTPException, status
from typing import Dict, Tuple, Optional, Callable, Any
import time
from collections import defaultdict
import threading
from functools import wraps
import hashlib

from app.core.config import settings


class InMemoryRateLimiter:
    """
    In-memory rate limiter для ограничения количества запросов
    """

    def __init__(self):
        self.requests: Dict[str, list] = defaultdict(list)
        self.lock = threading.Lock()

    def is_allowed(
            self,
            key: str,
            requests: int = None,
            period: int = None
    ) -> Tuple[bool, int]:
        """
        Проверка, разрешен ли запрос

        Returns:
            (allowed, remaining_requests)
        """
        limit = requests or settings.RATE_LIMIT_REQUESTS
        duration = period or settings.RATE_LIMIT_PERIOD

        current_time = time.time()

        with self.lock:
            # Очищаем старые запросы
            self.requests[key] = [
                req_time for req_time in self.requests[key]
                if current_time - req_time < duration
            ]

            # Проверяем лимит
            if len(self.requests[key]) >= limit:
                oldest = self.requests[key][0]
                time_left = int(duration - (current_time - oldest))
                return False, time_left

            # Добавляем текущий запрос
            self.requests[key].append(current_time)
            remaining = limit - len(self.requests[key])

            return True, remaining

    def reset(self, key: str):
        """Сбросить счетчик для ключа"""
        with self.lock:
            if key in self.requests:
                del self.requests[key]

    def get_remaining(self, key: str) -> int:
        """Получить количество оставшихся запросов"""
        limit = settings.RATE_LIMIT_REQUESTS
        duration = settings.RATE_LIMIT_PERIOD

        current_time = time.time()

        with self.lock:
            active_requests = [
                req_time for req_time in self.requests.get(key, [])
                if current_time - req_time < duration
            ]
            return max(0, limit - len(active_requests))


# Глобальный экземпляр rate limiter
rate_limiter = InMemoryRateLimiter()


def get_client_key(request: Request) -> str:
    """
    Получить уникальный ключ для клиента (IP адрес)
    """
    # Учитываем X-Forwarded-For заголовок для прокси
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "unknown"

    # Опционально: добавляем User-Agent для более точной идентификации
    user_agent = request.headers.get("User-Agent", "")

    # Создаем хэш для анонимизации
    key_string = f"{client_ip}:{user_agent}"
    return hashlib.md5(key_string.encode()).hexdigest()


def get_user_key(request: Request, user_id: Optional[str] = None) -> str:
    """
    Получить ключ для авторизованного пользователя
    """
    if user_id:
        return f"user:{user_id}"
    return get_client_key(request)


async def rate_limit_dependency(
        request: Request,
        requests: int = None,
        period: int = None,
        key_func: Optional[Callable[[Request], str]] = None
) -> None:
    """
    Dependency для rate limiting

    Использование:
        @router.get("/api")
        async def endpoint(
            _: None = Depends(rate_limit_dependency)
        ):
            return {"data": "limited"}

    С кастомными параметрами:
        @router.get("/api")
        async def endpoint(
            _: None = Depends(lambda r: rate_limit_dependency(r, requests=50, period=60))
        ):
            return {"data": "limited"}
    """
    if not settings.RATE_LIMIT_ENABLED:
        return

    # Получаем ключ
    if key_func:
        key = key_func(request)
    else:
        key = get_client_key(request)

    # Проверяем лимит
    allowed, time_left = rate_limiter.is_allowed(key, requests, period)

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many requests. Please try again in {time_left} seconds.",
            headers={"Retry-After": str(time_left)}
        )


def rate_limit(requests: int = None, period: int = None):
    """
    Декоратор для rate limiting

    Использование:
        @router.get("/api")
        @rate_limit(requests=50, period=60)
        async def endpoint():
            return {"data": "limited"}
    """

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Находим request в аргументах
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            if not request and "request" in kwargs:
                request = kwargs["request"]

            if request and settings.RATE_LIMIT_ENABLED:
                key = get_client_key(request)
                allowed, time_left = rate_limiter.is_allowed(key, requests, period)

                if not allowed:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=f"Too many requests. Please try again in {time_left} seconds.",
                        headers={"Retry-After": str(time_left)}
                    )

            return await func(*args, **kwargs)

        return wrapper

    return decorator


# Предустановленные лимиты для разных типов эндпоинтов

def strict_rate_limit():
    """Строгий лимит - 10 запросов в минуту"""
    return rate_limit_dependency


def medium_rate_limit():
    """Средний лимит - 60 запросов в минуту"""
    return lambda r: rate_limit_dependency(r, requests=60, period=60)


def relaxed_rate_limit():
    """Свободный лимит - 300 запросов в минуту"""
    return lambda r: rate_limit_dependency(r, requests=300, period=60)


def no_rate_limit():
    """Без лимита"""
    return None