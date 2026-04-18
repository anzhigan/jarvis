import pytest
from httpx import AsyncClient

from tests.conftest import register_and_login


@pytest.mark.asyncio
async def test_create_metric(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/metrics", json={
        "name": "Running",
        "unit": "km",
        "target_value": 100.0,
        "color": "#10B981",
    }, headers=headers)
    assert resp.status_code == 201
    m = resp.json()
    assert m["name"] == "Running"
    assert m["entries"] == []


@pytest.mark.asyncio
async def test_add_metric_entry(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/metrics", json={"name": "Steps", "unit": "steps"}, headers=headers)
    metric_id = resp.json()["id"]

    resp = await client.post(f"/api/metrics/{metric_id}/entries", json={
        "value": 8500,
        "date": "2025-04-01",
        "note": "Morning walk",
    }, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["value"] == 8500


@pytest.mark.asyncio
async def test_delete_metric_entry(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/metrics", json={"name": "Books", "unit": "pages"}, headers=headers)
    metric_id = resp.json()["id"]
    resp = await client.post(f"/api/metrics/{metric_id}/entries", json={"value": 50, "date": "2025-04-02"}, headers=headers)
    entry_id = resp.json()["id"]

    resp = await client.delete(f"/api/metrics/{metric_id}/entries/{entry_id}", headers=headers)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_update_metric(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/metrics", json={"name": "Sleep", "unit": "hours"}, headers=headers)
    metric_id = resp.json()["id"]

    resp = await client.patch(f"/api/metrics/{metric_id}", json={"target_value": 8.0, "color": "#8B5CF6"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["target_value"] == 8.0


@pytest.mark.asyncio
async def test_delete_metric(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/metrics", json={"name": "ToDelete"}, headers=headers)
    metric_id = resp.json()["id"]

    resp = await client.delete(f"/api/metrics/{metric_id}", headers=headers)
    assert resp.status_code == 204

    resp = await client.get(f"/api/metrics/{metric_id}", headers=headers)
    assert resp.status_code == 404
