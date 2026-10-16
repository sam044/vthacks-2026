import pytest
from hokiecare import app as api


@pytest.fixture(autouse=True)
def clear_outages():
    api.outages.clear()
    yield
    api.outages.clear()
