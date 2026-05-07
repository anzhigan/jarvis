import pytest
from httpx import AsyncClient

from tests.conftest import register_and_login


@pytest.mark.asyncio
async def test_create_routine(client: AsyncClient):
    headers = await register_and_login(client, "rc")
    resp = await client.post("/api/v1/routines", json={
        "title": "Morning run",
        "schedule_type": "daily",
        "kind": "boolean",
    }, headers=headers)
    assert resp.status_code == 200, resp.text
    r = resp.json()
    assert r["title"] == "Morning run"
    assert r["schedule_type"] == "daily"
    assert r["is_paused"] is False


@pytest.mark.asyncio
async def test_list_routines_isolated_per_user(client: AsyncClient):
    h1 = await register_and_login(client, "u1")
    h2 = await register_and_login(client, "u2")
    await client.post("/api/v1/routines", json={"title": "U1", "schedule_type": "daily"}, headers=h1)
    await client.post("/api/v1/routines", json={"title": "U2", "schedule_type": "daily"}, headers=h2)

    r1 = await client.get("/api/v1/routines", headers=h1)
    r2 = await client.get("/api/v1/routines", headers=h2)
    titles_1 = {r["title"] for r in r1.json()}
    titles_2 = {r["title"] for r in r2.json()}
    assert titles_1 == {"U1"}
    assert titles_2 == {"U2"}


@pytest.mark.asyncio
async def test_update_routine(client: AsyncClient):
    headers = await register_and_login(client, "ru")
    created = await client.post("/api/v1/routines", json={"title": "Old", "schedule_type": "daily"}, headers=headers)
    rid = created.json()["id"]
    resp = await client.patch(f"/api/v1/routines/{rid}", json={"title": "New", "is_paused": True}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "New"
    assert resp.json()["is_paused"] is True


@pytest.mark.asyncio
async def test_delete_routine(client: AsyncClient):
    headers = await register_and_login(client, "rd")
    created = await client.post("/api/v1/routines", json={"title": "Del", "schedule_type": "daily"}, headers=headers)
    rid = created.json()["id"]
    resp = await client.delete(f"/api/v1/routines/{rid}", headers=headers)
    assert resp.status_code == 204
    after = await client.get("/api/v1/routines", headers=headers)
    assert all(r["id"] != rid for r in after.json())


@pytest.mark.asyncio
async def test_invalid_schedule_type_rejected(client: AsyncClient):
    headers = await register_and_login(client, "rinv")
    resp = await client.post("/api/v1/routines", json={
        "title": "Bad",
        "schedule_type": "monthly_full_moon",
    }, headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_goal_routine_link_lifecycle(client: AsyncClient):
    headers = await register_and_login(client, "rl")
    goal = await client.post("/api/v1/tasks", json={"title": "Health"}, headers=headers)
    goal_id = goal.json()["id"]
    routine = await client.post("/api/v1/routines", json={"title": "Workout", "schedule_type": "daily"}, headers=headers)
    rid = routine.json()["id"]

    link = await client.post("/api/v1/routines/links", json={
        "goal_id": goal_id,
        "routine_id": rid,
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
        "target_count": 200,
    }, headers=headers)
    assert link.status_code == 200
    link_id = link.json()["id"]

    # Listing returns the link with hydrated routine
    listing = await client.get(f"/api/v1/routines/links/by-goal/{goal_id}", headers=headers)
    assert listing.status_code == 200
    body = listing.json()
    assert len(body) == 1
    assert body[0]["routine"]["id"] == rid

    # Duplicate link rejected
    dup = await client.post("/api/v1/routines/links", json={
        "goal_id": goal_id, "routine_id": rid, "start_date": "2026-01-01",
    }, headers=headers)
    assert dup.status_code == 409

    # Delete link
    rm = await client.delete(f"/api/v1/routines/links/{link_id}", headers=headers)
    assert rm.status_code == 204
