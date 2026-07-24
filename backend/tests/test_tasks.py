import pytest
from httpx import AsyncClient

from tests.conftest import register_and_login


@pytest.mark.asyncio
async def test_create_task(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/v1/tasks", json={
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
    await client.post("/api/v1/tasks", json={"title": "Task A", "status": "todo"}, headers=headers)
    await client.post("/api/v1/tasks", json={"title": "Task B", "status": "done"}, headers=headers)

    resp = await client.get("/api/v1/tasks?status_filter=todo", headers=headers)
    assert all(t["status"] == "todo" for t in resp.json())


@pytest.mark.asyncio
async def test_update_task_to_done(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/v1/tasks", json={"title": "Finish it"}, headers=headers)
    task_id = resp.json()["id"]

    resp = await client.patch(f"/api/v1/tasks/{task_id}", json={"status": "done"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["is_completed"] is True


@pytest.mark.asyncio
async def test_delete_task(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/v1/tasks", json={"title": "Delete me"}, headers=headers)
    task_id = resp.json()["id"]

    resp = await client.delete(f"/api/v1/tasks/{task_id}", headers=headers)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_invalid_status(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/v1/tasks", json={"title": "Bad", "status": "invalid"}, headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_task_isolation(client: AsyncClient):
    headers1 = await register_and_login(client, "t1")
    headers2 = await register_and_login(client, "t2")

    resp = await client.post("/api/v1/tasks", json={"title": "Secret task"}, headers=headers1)
    task_id = resp.json()["id"]

    # There's no GET /tasks/{id}; verify ownership isolation through the
    # mutating routes instead — both 404 for a non-owner (get_task_or_404
    # filters by user_id).
    resp = await client.patch(
        f"/api/v1/tasks/{task_id}", json={"title": "hijack"}, headers=headers2,
    )
    assert resp.status_code == 404

    resp = await client.delete(f"/api/v1/tasks/{task_id}", headers=headers2)
    assert resp.status_code == 404

    # Owner still sees it in their own list.
    resp = await client.get("/api/v1/tasks", headers=headers1)
    assert any(t["id"] == task_id for t in resp.json())


@pytest.mark.asyncio
async def test_duplicate_task_copies_structure(client: AsyncClient):
    headers = await register_and_login(client)

    # A goal with a step, a step-go, a standalone go, and a tag.
    task_id = (await client.post(
        "/api/v1/tasks",
        json={"title": "Ship v2", "status": "active", "priority": "high"},
        headers=headers,
    )).json()["id"]
    step_id = (await client.post(
        f"/api/v1/tasks/{task_id}/steps",
        json={"title": "Design", "position": 1},
        headers=headers,
    )).json()["id"]
    await client.post(
        "/api/v1/gos",
        json={"title": "Mockups", "task_id": task_id, "step_id": step_id},
        headers=headers,
    )
    standalone_id = (await client.post(
        "/api/v1/gos",
        json={"title": "Kickoff", "task_id": task_id},
        headers=headers,
    )).json()["id"]
    # Log an entry on the standalone go — this must NOT carry into the copy.
    await client.post(
        f"/api/v1/gos/{standalone_id}/entries",
        json={"date": "2026-07-20", "value": 1},
        headers=headers,
    )

    resp = await client.post(f"/api/v1/tasks/{task_id}/duplicate", headers=headers)
    assert resp.status_code == 201
    copy = resp.json()

    # New card, new id, "(copy)" title, same column/priority.
    assert copy["id"] != task_id
    assert copy["title"] == "Ship v2 (copy)"
    assert copy["status"] == "active"
    assert copy["priority"] == "high"

    # Structure came along: 1 step, 2 gos.
    assert len(copy["steps"]) == 1
    assert copy["steps"][0]["id"] != step_id
    assert copy["steps"][0]["status"] == "not_started"
    assert len(copy["gos"]) == 2
    titles = {g["title"] for g in copy["gos"]}
    assert titles == {"Mockups", "Kickoff"}

    # The step-go points at the *new* step, not the source one.
    mockups = next(g for g in copy["gos"] if g["title"] == "Mockups")
    assert mockups["step_id"] == copy["steps"][0]["id"]

    # History did not copy — the copy starts unlogged at 0%.
    for g in copy["gos"]:
        assert g["entries"] == []
    assert copy["progress"] == 0

    # The original is untouched and still present.
    listed = (await client.get("/api/v1/tasks", headers=headers)).json()
    ids = {t["id"] for t in listed}
    assert task_id in ids and copy["id"] in ids


@pytest.mark.asyncio
async def test_duplicate_task_not_found_for_non_owner(client: AsyncClient):
    h1 = await register_and_login(client, "dup1")
    h2 = await register_and_login(client, "dup2")
    task_id = (await client.post(
        "/api/v1/tasks", json={"title": "Mine"}, headers=h1,
    )).json()["id"]
    resp = await client.post(f"/api/v1/tasks/{task_id}/duplicate", headers=h2)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_go_completion_cascades_to_step_and_goal(client: AsyncClient):
    headers = await register_and_login(client)

    goal_id = (await client.post(
        "/api/v1/tasks",
        json={"title": "Ship", "status": "active"},
        headers=headers,
    )).json()["id"]
    step_id = (await client.post(
        f"/api/v1/tasks/{goal_id}/steps",
        json={"title": "Phase 1", "position": 1},
        headers=headers,
    )).json()["id"]
    g1 = (await client.post(
        "/api/v1/gos",
        json={"title": "G1", "task_id": goal_id, "step_id": step_id},
        headers=headers,
    )).json()["id"]
    g2 = (await client.post(
        "/api/v1/gos",
        json={"title": "G2", "task_id": goal_id, "step_id": step_id},
        headers=headers,
    )).json()["id"]

    async def goal_and_step():
        tasks = (await client.get("/api/v1/tasks", headers=headers)).json()
        t = next(x for x in tasks if x["id"] == goal_id)
        s = next(x for x in t["steps"] if x["id"] == step_id)
        return t["status"], s["status"]

    # First Go done — step still open (G2 remains), goal still active.
    await client.post(f"/api/v1/gos/{g1}/entries", json={"date": "2026-07-22", "value": 1}, headers=headers)
    gstatus, sstatus = await goal_and_step()
    assert sstatus != "done"
    assert gstatus == "active"

    # Second Go done — step completes, and with it the whole goal.
    await client.post(f"/api/v1/gos/{g2}/entries", json={"date": "2026-07-22", "value": 1}, headers=headers)
    gstatus, sstatus = await goal_and_step()
    assert sstatus == "done"
    assert gstatus == "done"

    # Un-complete one Go — step and goal revert.
    await client.post(f"/api/v1/gos/{g2}/entries", json={"date": "2026-07-22", "value": 0}, headers=headers)
    gstatus, sstatus = await goal_and_step()
    assert sstatus == "in_progress"
    assert gstatus == "active"


@pytest.mark.asyncio
async def test_standalone_go_completion_no_cascade(client: AsyncClient):
    headers = await register_and_login(client)
    # A Go with no parent task must not blow up the cascade path.
    go_id = (await client.post(
        "/api/v1/gos", json={"title": "solo"}, headers=headers,
    )).json()["id"]
    resp = await client.post(
        f"/api/v1/gos/{go_id}/entries", json={"date": "2026-07-22", "value": 1}, headers=headers,
    )
    assert resp.status_code == 200
