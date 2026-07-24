import pytest
from httpx import AsyncClient

from tests.conftest import register_and_login


@pytest.mark.asyncio
async def test_create_and_list_ways(client: AsyncClient):
    headers = await register_and_login(client)

    resp = await client.post("/api/v1/ways", json={"name": "Career"}, headers=headers)
    assert resp.status_code == 201
    way = resp.json()
    assert way["name"] == "Career"
    assert way["topics"] == []
    assert way["notes"] == []

    resp = await client.get("/api/v1/ways", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


@pytest.mark.asyncio
async def test_update_way(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/v1/ways", json={"name": "Old Name"}, headers=headers)
    way_id = resp.json()["id"]

    resp = await client.patch(f"/api/v1/ways/{way_id}", json={"name": "New Name"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


@pytest.mark.asyncio
async def test_delete_way(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/v1/ways", json={"name": "ToDelete"}, headers=headers)
    way_id = resp.json()["id"]

    resp = await client.delete(f"/api/v1/ways/{way_id}", headers=headers)
    assert resp.status_code == 204

    resp = await client.get("/api/v1/ways", headers=headers)
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_topic(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/v1/ways", json={"name": "Science"}, headers=headers)
    way_id = resp.json()["id"]

    resp = await client.post(f"/api/v1/ways/{way_id}/topics", json={"name": "Physics"}, headers=headers)
    assert resp.status_code == 201
    topic = resp.json()
    assert topic["name"] == "Physics"
    assert topic["way_id"] == way_id


@pytest.mark.asyncio
async def test_create_note_in_topic(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/v1/ways", json={"name": "EQ"}, headers=headers)
    way_id = resp.json()["id"]
    resp = await client.post(f"/api/v1/ways/{way_id}/topics", json={"name": "Communication"}, headers=headers)
    topic_id = resp.json()["id"]

    resp = await client.post("/api/v1/notes", json={
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
    resp = await client.post("/api/v1/ways", json={"name": "Career"}, headers=headers)
    way_id = resp.json()["id"]

    resp = await client.post("/api/v1/notes", json={
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
    resp = await client.post("/api/v1/notes", json={"name": "Orphan", "content": ""}, headers=headers)
    assert resp.status_code == 400

    # Two parents
    resp2 = await client.post("/api/v1/ways", json={"name": "W"}, headers=headers)
    way_id = resp2.json()["id"]
    resp3 = await client.post(f"/api/v1/ways/{way_id}/topics", json={"name": "T"}, headers=headers)
    topic_id = resp3.json()["id"]

    resp = await client.post("/api/v1/notes", json={
        "name": "Double", "content": "", "way_id": way_id, "topic_id": topic_id
    }, headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_update_note_content(client: AsyncClient):
    headers = await register_and_login(client)
    resp = await client.post("/api/v1/ways", json={"name": "W"}, headers=headers)
    way_id = resp.json()["id"]
    resp = await client.post(f"/api/v1/ways/{way_id}/topics", json={"name": "T"}, headers=headers)
    topic_id = resp.json()["id"]
    resp = await client.post("/api/v1/notes", json={"name": "N", "content": "<p>old</p>", "topic_id": topic_id}, headers=headers)
    note_id = resp.json()["id"]

    resp = await client.patch(f"/api/v1/notes/{note_id}", json={"content": "<p>new content</p>"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["content"] == "<p>new content</p>"


@pytest.mark.asyncio
async def test_reorder_ways(client: AsyncClient):
    headers = await register_and_login(client)
    w1 = (await client.post("/api/v1/ways", json={"name": "A", "order": 0}, headers=headers)).json()
    w2 = (await client.post("/api/v1/ways", json={"name": "B", "order": 1}, headers=headers)).json()

    # Reordering is per-way via PATCH {order} — the old bulk /ways/reorder
    # endpoint was removed. Swap the two orders and verify the GET list
    # comes back in the new sequence.
    assert (await client.patch(
        f"/api/v1/ways/{w1['id']}", json={"order": 1}, headers=headers,
    )).status_code == 200
    assert (await client.patch(
        f"/api/v1/ways/{w2['id']}", json={"order": 0}, headers=headers,
    )).status_code == 200

    ways = (await client.get("/api/v1/ways", headers=headers)).json()
    assert [w["name"] for w in ways] == ["B", "A"]


@pytest.mark.asyncio
async def test_way_isolation_between_users(client: AsyncClient):
    headers1 = await register_and_login(client, "user1")
    headers2 = await register_and_login(client, "user2")

    resp = await client.post("/api/v1/ways", json={"name": "Private Way"}, headers=headers1)
    way_id = resp.json()["id"]

    # User 2 should not see user 1's ways
    resp = await client.get("/api/v1/ways", headers=headers2)
    assert resp.json() == []

    # User 2 should get 404 on user 1's way
    resp = await client.get(f"/api/v1/ways/{way_id}", headers=headers2)
    assert resp.status_code == 404


async def _make_way_topic(client: AsyncClient, headers) -> tuple[str, str]:
    way_id = (await client.post(
        "/api/v1/ways", json={"name": "Study"}, headers=headers,
    )).json()["id"]
    topic_id = (await client.post(
        f"/api/v1/ways/{way_id}/topics", json={"name": "Math"}, headers=headers,
    )).json()["id"]
    return way_id, topic_id


@pytest.mark.asyncio
async def test_subtopic_crud_and_note(client: AsyncClient):
    headers = await register_and_login(client)
    way_id, topic_id = await _make_way_topic(client, headers)

    # Create a subtopic under the topic.
    resp = await client.post(
        f"/api/v1/topics/{topic_id}/subtopics",
        json={"name": "Algebra"}, headers=headers,
    )
    assert resp.status_code == 201
    sub = resp.json()
    assert sub["name"] == "Algebra"
    assert sub["topic_id"] == topic_id
    assert sub["notes"] == []
    sub_id = sub["id"]

    # It shows up nested under the topic in the ways tree.
    ways = (await client.get("/api/v1/ways", headers=headers)).json()
    topic = ways[0]["topics"][0]
    assert len(topic["subtopics"]) == 1
    assert topic["subtopics"][0]["id"] == sub_id

    # Create a note inside the subtopic.
    resp = await client.post(
        "/api/v1/notes",
        json={"name": "Quadratics", "subtopic_id": sub_id}, headers=headers,
    )
    assert resp.status_code == 201
    note = resp.json()
    assert note["subtopic_id"] == sub_id
    note_id = note["id"]

    # The note is reachable and editable through _get_note_or_404 (ownership
    # via subtopic → topic → way).
    resp = await client.patch(
        f"/api/v1/notes/{note_id}", json={"name": "Quadratic equations"}, headers=headers,
    )
    assert resp.status_code == 200

    # Rename + the note appears nested in the tree.
    await client.patch(f"/api/v1/subtopics/{sub_id}", json={"name": "Algebra II"}, headers=headers)
    ways = (await client.get("/api/v1/ways", headers=headers)).json()
    st = ways[0]["topics"][0]["subtopics"][0]
    assert st["name"] == "Algebra II"
    assert len(st["notes"]) == 1
    assert st["notes"][0]["id"] == note_id

    # Delete subtopic cascades its notes away.
    resp = await client.delete(f"/api/v1/subtopics/{sub_id}", headers=headers)
    assert resp.status_code == 204
    resp = await client.get(f"/api/v1/notes/{note_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_move_note_into_subtopic(client: AsyncClient):
    headers = await register_and_login(client)
    way_id, topic_id = await _make_way_topic(client, headers)
    sub_id = (await client.post(
        f"/api/v1/topics/{topic_id}/subtopics", json={"name": "S"}, headers=headers,
    )).json()["id"]

    # Note created at way level, then moved down into the subtopic.
    note_id = (await client.post(
        "/api/v1/notes", json={"name": "N", "way_id": way_id}, headers=headers,
    )).json()["id"]
    resp = await client.post(
        f"/api/v1/notes/{note_id}/move", json={"subtopic_id": sub_id}, headers=headers,
    )
    assert resp.status_code == 200
    moved = resp.json()
    assert moved["subtopic_id"] == sub_id
    assert moved["way_id"] is None

    # Moving with two targets is rejected.
    resp = await client.post(
        f"/api/v1/notes/{note_id}/move",
        json={"way_id": way_id, "subtopic_id": sub_id}, headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_subtopic_isolation(client: AsyncClient):
    h1 = await register_and_login(client, "st1")
    h2 = await register_and_login(client, "st2")
    _, topic_id = await _make_way_topic(client, h1)
    sub_id = (await client.post(
        f"/api/v1/topics/{topic_id}/subtopics", json={"name": "Mine"}, headers=h1,
    )).json()["id"]
    # Non-owner can't touch it.
    assert (await client.patch(f"/api/v1/subtopics/{sub_id}", json={"name": "x"}, headers=h2)).status_code == 404
    assert (await client.delete(f"/api/v1/subtopics/{sub_id}", headers=h2)).status_code == 404
    # Non-owner can't create a note in it.
    resp = await client.post("/api/v1/notes", json={"name": "x", "subtopic_id": sub_id}, headers=h2)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_subsubtopic_crud_and_note(client: AsyncClient):
    headers = await register_and_login(client)
    way_id, topic_id = await _make_way_topic(client, headers)
    sub_id = (await client.post(
        f"/api/v1/topics/{topic_id}/subtopics", json={"name": "Algebra"}, headers=headers,
    )).json()["id"]

    # Create a subsubtopic under the subtopic.
    resp = await client.post(
        f"/api/v1/subtopics/{sub_id}/subsubtopics",
        json={"name": "Quadratics"}, headers=headers,
    )
    assert resp.status_code == 201
    ss = resp.json()
    assert ss["name"] == "Quadratics"
    assert ss["subtopic_id"] == sub_id
    ss_id = ss["id"]

    # Nested under subtopic in the ways tree.
    ways = (await client.get("/api/v1/ways", headers=headers)).json()
    sub = ways[0]["topics"][0]["subtopics"][0]
    assert len(sub["subsubtopics"]) == 1
    assert sub["subsubtopics"][0]["id"] == ss_id

    # A note inside the subsubtopic; reachable + editable (ownership via
    # subsubtopic → subtopic → topic → way).
    note_id = (await client.post(
        "/api/v1/notes", json={"name": "Roots", "subsubtopic_id": ss_id}, headers=headers,
    )).json()["id"]
    assert (await client.patch(
        f"/api/v1/notes/{note_id}", json={"name": "Roots of a quadratic"}, headers=headers,
    )).status_code == 200

    ways = (await client.get("/api/v1/ways", headers=headers)).json()
    ss_tree = ways[0]["topics"][0]["subtopics"][0]["subsubtopics"][0]
    assert len(ss_tree["notes"]) == 1
    assert ss_tree["notes"][0]["id"] == note_id

    # Delete subsubtopic cascades its notes away.
    assert (await client.delete(f"/api/v1/subsubtopics/{ss_id}", headers=headers)).status_code == 204
    assert (await client.get(f"/api/v1/notes/{note_id}", headers=headers)).status_code == 404


@pytest.mark.asyncio
async def test_move_note_into_subsubtopic(client: AsyncClient):
    headers = await register_and_login(client)
    way_id, topic_id = await _make_way_topic(client, headers)
    sub_id = (await client.post(
        f"/api/v1/topics/{topic_id}/subtopics", json={"name": "S"}, headers=headers,
    )).json()["id"]
    ss_id = (await client.post(
        f"/api/v1/subtopics/{sub_id}/subsubtopics", json={"name": "SS"}, headers=headers,
    )).json()["id"]

    note_id = (await client.post(
        "/api/v1/notes", json={"name": "N", "way_id": way_id}, headers=headers,
    )).json()["id"]
    resp = await client.post(
        f"/api/v1/notes/{note_id}/move", json={"subsubtopic_id": ss_id}, headers=headers,
    )
    assert resp.status_code == 200
    moved = resp.json()
    assert moved["subsubtopic_id"] == ss_id
    assert moved["way_id"] is None


@pytest.mark.asyncio
async def test_subsubtopic_isolation(client: AsyncClient):
    h1 = await register_and_login(client, "sss1")
    h2 = await register_and_login(client, "sss2")
    _, topic_id = await _make_way_topic(client, h1)
    sub_id = (await client.post(
        f"/api/v1/topics/{topic_id}/subtopics", json={"name": "S"}, headers=h1,
    )).json()["id"]
    ss_id = (await client.post(
        f"/api/v1/subtopics/{sub_id}/subsubtopics", json={"name": "Mine"}, headers=h1,
    )).json()["id"]
    assert (await client.patch(f"/api/v1/subsubtopics/{ss_id}", json={"name": "x"}, headers=h2)).status_code == 404
    assert (await client.delete(f"/api/v1/subsubtopics/{ss_id}", headers=h2)).status_code == 404
    resp = await client.post("/api/v1/notes", json={"name": "x", "subsubtopic_id": ss_id}, headers=h2)
    assert resp.status_code == 404
