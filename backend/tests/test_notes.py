import pytest
from httpx import AsyncClient

from tests.conftest import register_and_login


@pytest.mark.asyncio
async def test_create_and_list_ways(client: AsyncClient):
    headers = await register_and_login(client)

    resp = await client.post("/api/ways", json={"name": "Career"}, headers=headers)
    assert resp.status_code == 201
    way = resp.json()
    assert way["name"] == "Career"
    assert way["topics"] == []
    assert way["note"] is None

    resp = await client.get("/api/ways", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


@pytest.mark.asyncio
async def test_update_way(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/ways", json={"name": "Old Name"}, headers=headers)
    way_id = resp.json()["id"]

    resp = await client.patch(f"/api/ways/{way_id}", json={"name": "New Name"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


@pytest.mark.asyncio
async def test_delete_way(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/ways", json={"name": "ToDelete"}, headers=headers)
    way_id = resp.json()["id"]

    resp = await client.delete(f"/api/ways/{way_id}", headers=headers)
    assert resp.status_code == 204

    resp = await client.get("/api/ways", headers=headers)
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_topic(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/ways", json={"name": "Science"}, headers=headers)
    way_id = resp.json()["id"]

    resp = await client.post(f"/api/ways/{way_id}/topics", json={"name": "Physics"}, headers=headers)
    assert resp.status_code == 201
    topic = resp.json()
    assert topic["name"] == "Physics"
    assert topic["way_id"] == way_id


@pytest.mark.asyncio
async def test_create_note_in_topic(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/ways", json={"name": "EQ"}, headers=headers)
    way_id = resp.json()["id"]
    resp = await client.post(f"/api/ways/{way_id}/topics", json={"name": "Communication"}, headers=headers)
    topic_id = resp.json()["id"]

    resp = await client.post("/api/notes", json={
        "name": "Active Listening",
        "content": "<p>Listen carefully</p>",
        "topic_id": topic_id,
    }, headers=headers)
    assert resp.status_code == 201
    note = resp.json()
    assert note["name"] == "Active Listening"
    assert note["topic_id"] == topic_id


@pytest.mark.asyncio
async def test_create_note_at_way_level(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/ways", json={"name": "Career"}, headers=headers)
    way_id = resp.json()["id"]

    resp = await client.post("/api/notes", json={
        "name": "Career Overview",
        "content": "<p>My career plan</p>",
        "way_id": way_id,
    }, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["way_id"] == way_id


@pytest.mark.asyncio
async def test_note_requires_exactly_one_parent(client: AsyncClient):
    headers = await register_and_login(client)
    # No parent
    resp = await client.post("/api/notes", json={"name": "Orphan", "content": ""}, headers=headers)
    assert resp.status_code == 400

    # Two parents
    resp2 = await client.post("/api/ways", json={"name": "W"}, headers=headers)
    way_id = resp2.json()["id"]
    resp3 = await client.post(f"/api/ways/{way_id}/topics", json={"name": "T"}, headers=headers)
    topic_id = resp3.json()["id"]

    resp = await client.post("/api/notes", json={
        "name": "Double", "content": "", "way_id": way_id, "topic_id": topic_id
    }, headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_update_note_content(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/ways", json={"name": "W"}, headers=headers)
    way_id = resp.json()["id"]
    resp = await client.post(f"/api/ways/{way_id}/topics", json={"name": "T"}, headers=headers)
    topic_id = resp.json()["id"]
    resp = await client.post("/api/notes", json={"name": "N", "content": "<p>old</p>", "topic_id": topic_id}, headers=headers)
    note_id = resp.json()["id"]

    resp = await client.patch(f"/api/notes/{note_id}", json={"content": "<p>new content</p>"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["content"] == "<p>new content</p>"


@pytest.mark.asyncio
async def test_reorder_ways(client: AsyncClient):
    headers = await register_and_login(client)
    w1 = (await client.post("/api/ways", json={"name": "A", "order": 0}, headers=headers)).json()
    w2 = (await client.post("/api/ways", json={"name": "B", "order": 1}, headers=headers)).json()

    resp = await client.post("/api/ways/reorder", json={"items": [
        {"id": w1["id"], "order": 1},
        {"id": w2["id"], "order": 0},
    ]}, headers=headers)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_way_isolation_between_users(client: AsyncClient):
    headers1 = await register_and_login(client, "user1")
    headers2 = await register_and_login(client, "user2")

    resp = await client.post("/api/ways", json={"name": "Private Way"}, headers=headers1)
    way_id = resp.json()["id"]

    # User 2 should not see user 1's ways
    resp = await client.get("/api/ways", headers=headers2)
    assert resp.json() == []

    # User 2 should get 404 on user 1's way
    resp = await client.get(f"/api/ways/{way_id}", headers=headers2)
    assert resp.status_code == 404
