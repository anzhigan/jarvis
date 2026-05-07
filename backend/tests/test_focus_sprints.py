import pytest
from httpx import AsyncClient

from tests.conftest import register_and_login


@pytest.mark.asyncio
async def test_create_focus_sprint(client: AsyncClient):
    headers = await register_and_login(client, "fc")
    resp = await client.post("/api/v1/focus-sprints", json={
        "title": "Q1 sprint",
        "start_date": "2026-01-01",
        "end_date": "2026-03-31",
        "color": "#5B5BD6",
    }, headers=headers)
    assert resp.status_code == 200, resp.text
    sp = resp.json()
    assert sp["title"] == "Q1 sprint"
    assert sp["items"] == []


@pytest.mark.asyncio
async def test_focus_sprint_isolated_per_user(client: AsyncClient):
    h1 = await register_and_login(client, "fu1")
    h2 = await register_and_login(client, "fu2")
    await client.post("/api/v1/focus-sprints", json={
        "title": "U1", "start_date": "2026-01-01", "end_date": "2026-01-31",
    }, headers=h1)
    r1 = await client.get("/api/v1/focus-sprints", headers=h1)
    r2 = await client.get("/api/v1/focus-sprints", headers=h2)
    assert len(r1.json()) == 1
    assert len(r2.json()) == 0


@pytest.mark.asyncio
async def test_focus_sprint_invalid_dates(client: AsyncClient):
    headers = await register_and_login(client, "fbad")
    resp = await client.post("/api/v1/focus-sprints", json={
        "title": "Backwards",
        "start_date": "2026-12-31",
        "end_date": "2026-01-01",
    }, headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_add_and_remove_items(client: AsyncClient):
    headers = await register_and_login(client, "fitem")
    goal = await client.post("/api/v1/tasks", json={"title": "Goal X"}, headers=headers)
    goal_id = goal.json()["id"]
    routine = await client.post("/api/v1/routines", json={"title": "Daily X", "schedule_type": "daily"}, headers=headers)
    routine_id = routine.json()["id"]

    sp = await client.post("/api/v1/focus-sprints", json={
        "title": "Mix", "start_date": "2026-01-01", "end_date": "2026-01-31",
    }, headers=headers)
    sp_id = sp.json()["id"]

    # Add a goal and a routine — verify hydration batch returns titles
    r1 = await client.post(f"/api/v1/focus-sprints/{sp_id}/items", json={
        "item_type": "goal", "goal_id": goal_id,
    }, headers=headers)
    r2 = await client.post(f"/api/v1/focus-sprints/{sp_id}/items", json={
        "item_type": "routine", "routine_id": routine_id,
    }, headers=headers)
    assert r1.status_code == 200
    assert r2.status_code == 200

    # Read back — items should be hydrated with title
    fetched = await client.get("/api/v1/focus-sprints", headers=headers)
    items = fetched.json()[0]["items"]
    titles = {i["title"] for i in items}
    assert "Goal X" in titles
    assert "Daily X" in titles

    # Remove one
    item_id = items[0]["id"]
    rm = await client.delete(f"/api/v1/focus-sprints/{sp_id}/items/{item_id}", headers=headers)
    assert rm.status_code == 204


@pytest.mark.asyncio
async def test_add_item_validates_ownership(client: AsyncClient):
    h1 = await register_and_login(client, "fo1")
    h2 = await register_and_login(client, "fo2")
    other_goal = await client.post("/api/v1/tasks", json={"title": "Other"}, headers=h1)
    other_goal_id = other_goal.json()["id"]

    sp = await client.post("/api/v1/focus-sprints", json={
        "title": "S", "start_date": "2026-01-01", "end_date": "2026-01-31",
    }, headers=h2)
    sp_id = sp.json()["id"]

    # h2 cannot attach h1's goal
    resp = await client.post(f"/api/v1/focus-sprints/{sp_id}/items", json={
        "item_type": "goal", "goal_id": other_goal_id,
    }, headers=h2)
    assert resp.status_code == 404
