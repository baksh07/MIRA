import uuid

import pytest
from fastapi.testclient import TestClient

from mira_backend.main import app
from mira_backend.services.container import container
from mira_backend.services.sessions import preferences_to_commands

client = TestClient(app)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def drivers() -> dict[str, dict]:
    return {d["slug"]: d for d in client.get("/api/drivers").json()}


def identify(slug: str) -> tuple[str, dict]:
    vid = str(uuid.uuid4())
    response = client.post("/api/sessions", json={"vehicle_id": vid, "driver_id": drivers()[slug]["id"]})
    assert response.status_code == 200
    return vid, response.json()


def test_lists_the_two_demo_drivers() -> None:
    listed = drivers()
    assert {d["gender"] for d in listed.values()} == {"male", "female"}


def test_identifying_a_driver_applies_their_preferences_to_the_car() -> None:
    vid, started = identify("sophia")
    assert started["driver"]["display_name"] == "Sophia" and started["applied"]
    car = client.get(f"/api/vehicles/{vid}").json()
    assert car["climate"]["temperature_c"] == 19.5
    assert car["driving_mode"] == "sport"
    assert car["ambient_lighting"]["color"] == "#FF5A8A"


def test_switching_driver_reapplies_the_other_profile() -> None:
    vid, _ = identify("sophia")
    daniel = drivers()["daniel"]
    client.post("/api/sessions", json={"vehicle_id": vid, "driver_id": daniel["id"]})
    car = client.get(f"/api/vehicles/{vid}").json()
    assert car["climate"]["temperature_c"] == 22 and car["driving_mode"] == "comfort"
    assert client.get(f"/api/sessions/{vid}").json()["slug"] == "daniel"


def test_unknown_driver_is_rejected() -> None:
    response = client.post("/api/sessions", json={"vehicle_id": str(uuid.uuid4()), "driver_id": str(uuid.uuid4())})
    assert response.status_code == 404


@pytest.mark.anyio
async def test_memories_are_isolated_between_drivers() -> None:
    sophia_car, _ = identify("sophia")
    daniel_car, _ = identify("daniel")
    repo = container().repo
    sophia_id = uuid.UUID(drivers()["sophia"]["id"])
    secret = await repo.add_memory(sophia_id, "profile", "Sophia's private note")
    assert secret is not None

    daniel_view = client.get(f"/api/sessions/{daniel_car}/profile").json()
    assert all(m["content"] != "Sophia's private note" for m in daniel_view["memories"])

    # Daniel's car cannot delete Sophia's memory even with its id.
    assert client.delete(f"/api/sessions/{daniel_car}/memories/{secret.id}").status_code == 404
    # Sophia can delete her own.
    assert client.delete(f"/api/sessions/{sophia_car}/memories/{secret.id}").status_code == 204


def test_profile_requires_an_identified_driver() -> None:
    assert client.get(f"/api/sessions/{uuid.uuid4()}/profile").status_code == 404


def test_invalid_stored_preferences_are_skipped_not_applied() -> None:
    commands = preferences_to_commands({"temperature_c": 99, "seat_heating": 2, "driving_mode": "warp"})
    assert [c.type for c in commands] == ["set_seat_heating"]


@pytest.mark.anyio
async def test_duplicate_memories_are_not_stored_twice() -> None:
    repo = container().repo
    driver_id = uuid.UUID(drivers()["daniel"]["id"])
    assert await repo.add_memory(driver_id, "preference", "Likes jazz on Fridays") is not None
    assert await repo.add_memory(driver_id, "preference", "likes jazz on fridays.") is None


def test_saving_a_preference_is_validated_and_scoped_to_the_session_driver() -> None:
    sophia_car, _ = identify("sophia")
    daniel_car, _ = identify("daniel")
    assert client.put(f"/api/sessions/{sophia_car}/preferences/temperature_c", json={"value": 24.2}).json() == {"key": "temperature_c", "value": 24.0}
    assert client.get(f"/api/sessions/{sophia_car}/profile").json()["preferences"]["temperature_c"] == 24.0
    assert client.get(f"/api/sessions/{daniel_car}/profile").json()["preferences"]["temperature_c"] == 22
    assert client.put(f"/api/sessions/{sophia_car}/preferences/temperature_c", json={"value": 99}).status_code == 422
    assert client.put(f"/api/sessions/{sophia_car}/preferences/password", json={"value": "x"}).status_code == 422
    assert client.put(f"/api/sessions/{uuid.uuid4()}/preferences/temperature_c", json={"value": 22}).status_code == 404



@pytest.mark.anyio
async def test_arrival_is_remembered_as_an_episodic_memory_for_that_driver() -> None:
    vid, started = identify("sophia")
    await container().sessions.record_arrival(vid, "Lake Starnberg")
    memories = client.get(f"/api/sessions/{vid}/profile").json()["memories"]
    assert any(m["content"].startswith("Drove to Lake Starnberg") and m["category"] == "episodic" for m in memories)
    await container().sessions.record_arrival(str(uuid.uuid4()), "Nowhere")  # no driver: nothing stored


@pytest.mark.anyio
async def test_new_driver_gets_onboarding_and_returning_driver_does_not() -> None:
    import uuid as _uuid

    from mira_backend.services.driver_repository import InMemoryDriverRepository
    from mira_backend.services.sessions import SessionService

    repo = InMemoryDriverRepository()
    daniel = next(d for d in repo.drivers.values() if d.slug == "daniel")
    for memory in await repo.list_memories(daniel.id):
        await repo.delete_memory(daniel.id, memory.id)
    service = SessionService(repo)
    car = _uuid.uuid4()
    first = await service.identify(car, daniel.id)
    assert "what should I call you" in first.greeting and service.current(car).onboarding
    assert (await repo.recent_messages(first.session_id))[-1]["content"] == first.greeting

    await repo.add_memory(daniel.id, "profile", "Prefers to be called Dan.")
    second = await service.identify(_uuid.uuid4(), daniel.id)
    assert second.greeting.startswith("Welcome back")
    assert "Dan" in second.greeting  # the name he asked for, not his profile name


@pytest.mark.anyio
async def test_onboarding_asks_each_question_once_and_ends_when_driving_off() -> None:
    import uuid as _uuid

    from mira_backend.agent.graph import ONBOARDING_TOPICS, system_prompt
    from mira_backend.api.assistant import advance_session
    from mira_backend.models.vehicle import LeaveGarage
    from mira_backend.services.driver_repository import InMemoryDriverRepository
    from mira_backend.services.sessions import SessionService
    from mira_backend.services.vehicle_simulator import vehicles

    repo = InMemoryDriverRepository()
    daniel = next(d for d in repo.drivers.values() if d.slug == "daniel")
    for memory in await repo.list_memories(daniel.id):
        await repo.delete_memory(daniel.id, memory.id)
    service = SessionService(repo)
    car = _uuid.uuid4()
    await service.identify(car, daniel.id)
    session = service.current(car)
    assert session is not None and session.onboarding_step == 0

    # The name answer: MIRA learns to call him Dan, and moves to the next question.
    advance_session(session, car, ["Prefers to be called Dan."], stop_onboarding=False)
    assert session.call_me == "Dan" and session.onboarding_step == 1
    prompt = system_prompt(vehicles.get(str(car)).state, daniel, {}, [], session.onboarding_step, session.call_me)
    assert "never ask or change again): what to call them" in prompt and "likes to be called Dan" in prompt
    assert ONBOARDING_TOPICS[2] in prompt  # the next question

    # A detour still moves on: the same question is never asked twice.
    advance_session(session, car, [], stop_onboarding=False)
    assert session.onboarding_step == 2 and session.onboarding

    # Driving off ends the questions for this drive.
    await vehicles.get(str(car)).apply(LeaveGarage())
    advance_session(session, car, [], stop_onboarding=False)
    assert not session.onboarding
    no_quiz = system_prompt(vehicles.get(str(car)).state, daniel, {}, [], None, "Dan")
    assert "First drive" not in no_quiz


@pytest.mark.anyio
async def test_driver_can_stop_the_onboarding_questions() -> None:
    import uuid as _uuid

    from mira_backend.api.assistant import advance_session
    from mira_backend.services.driver_repository import InMemoryDriverRepository
    from mira_backend.services.sessions import SessionService

    repo = InMemoryDriverRepository()
    sophia = next(d for d in repo.drivers.values() if d.slug == "sophia")
    for memory in await repo.list_memories(sophia.id):
        await repo.delete_memory(sophia.id, memory.id)
    service = SessionService(repo)
    car = _uuid.uuid4()
    await service.identify(car, sophia.id)
    session = service.current(car)
    assert session is not None
    advance_session(session, car, [], stop_onboarding=True)
    assert not session.onboarding
