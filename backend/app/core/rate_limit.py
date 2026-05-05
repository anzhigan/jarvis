"""Shared `slowapi` Limiter instance.

Per-route limits are declared with `@limiter.limit("...")` on path operations.
Uses in-process memory storage — fine for single-VPS deploy. If we ever go
multi-instance, switch `storage_uri` to redis.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
