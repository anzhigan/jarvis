import pytest
from httpx import AsyncClient

from tests.conftest import register_and_login


@pytest.mark.asyncio
async def test_create_task(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/tasks", json={
        "title": "Write unit tests",
        "priority": "high",
        "status": "todo",
    }, headers=headers)
    assert resp.status_code == 201
    task = resp.json()
    assert task["title"] == "Write unit tests"
    assert task["is_completed"] is False


@pytest.mark.asyncio
async def test_list_tasks_with_filter(client: AsyncClient):
    headers = await register_and_login(client)
    await client.post("/api/tasks", json={"title": "Task A", "status": "todo"}, headers=headers)
    await client.post("/api/tasks", json={"title": "Task B", "status": "done"}, headers=headers)

    resp = await client.get("/api/tasks?status_filter=todo", headers=headers)
    assert all(t["status"] == "todo" for t in resp.json())


@pytest.mark.asyncio
async def test_update_task_to_done(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/tasks", json={"title": "Finish it"}, headers=headers)
    task_id = resp.json()["id"]

    resp = await client.patch(f"/api/tasks/{task_id}", json={"status": "done"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["is_completed"] is True


@pytest.mark.asyncio
async def test_delete_task(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/tasks", json={"title": "Delete me"}, headers=headers)
    task_id = resp.json()["id"]

    resp = await client.delete(f"/api/tasks/{task_id}", headers=headers)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_invalid_status(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/tasks", json={"title": "Bad", "status": "invalid"}, headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_task_isolation(client: AsyncClient):
    headers1 = await register_and_login(client, "t1")
    headers2 = await register_and_login(client, "t2")

    resp = await client.post("/api/tasks", json={"title": "Secret task"}, headers=headers1)
    task_id = resp.json()["id"]

    resp = await client.get(f"/api/tasks/{task_id}", headers=headers2)
    assert resp.status_code == 404
