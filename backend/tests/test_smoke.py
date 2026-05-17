"""
Smoke tests for the PrivateGPT backend.
Add endpoint and unit tests here as the app grows.
"""


def test_imports():
    """Confirm the test suite itself runs."""
    assert True


def test_db_enums_importable():
    """Verify db_enums module loads without errors."""
    import sys
    import os
    # Add backend to path so imports resolve the same way as production
    backend_dir = os.path.join(os.path.dirname(__file__), "..")
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    import db_enums
    assert db_enums is not None
