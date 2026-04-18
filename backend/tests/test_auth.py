import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register(client: AsyncClient):
    resp = await client.post("/api/auth/register", json={
        "email": "newuser@test.com",
        "username": "newuser",
        "password": "password123",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "newuser@test.com"
    assert "id" in data


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    payload = {"email": "dup@test.com", "username": "dup1", "password": "password123"}
    await client.post("/api/auth/register", json=payload)
    payload["username"] = "dup2"
    resp = await client.post("/api/auth/register", json=payload)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_login(client: AsyncClient):
    await client.post("/api/auth/register", json={
        "email": "login@test.com", "username": "loginuser", "password": "password123"
    })
    resp = await client.post("/api/auth/login", json={
        "email": "login@test.com", "password": "password123"
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()
    assert "refresh_token" in resp.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    await client.post("/api/auth/register", json={
        "email": "wrongpw@test.com", "username": "wrongpwuser", "password": "password123"
    })
    resp = await client.post("/api/auth/login", json={
        "email": "wrongpw@test.com", "password": "wrongpassword"
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me(client: AsyncClient):
    await client.post("/api/auth/register", json={
        "email": "me@test.com", "username": "meuser", "password": "password123"
    })
    resp = await client.post("/api/auth/login", json={"email": "me@test.com", "password": "password123"})
    token = resp.json()["access_token"]
    resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "me@test.com"


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient):
    await client.post("/api/auth/register", json={
        "email": "refresh@test.com", "username": "refreshuser", "password": "password123"
    })
    resp = await client.post("/api/auth/login", json={"email": "refresh@test.com", "password": "password123"})
    refresh_token = resp.json()["refresh_token"]
    resp = await client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert "access_token" in resp.json()
