from app.feed import VIDEOS_PER_GAME, should_serve_game, videos_since_last_game
from app.models import Impression


def _video() -> Impression:
    return Impression(kind="video", content_id="v")


def _game() -> Impression:
    return Impression(kind="game", content_id="g")


def test_counts_videos_until_most_recent_game() -> None:
    assert videos_since_last_game([_video(), _video(), _game(), _video()]) == 2


def test_counts_all_when_no_game() -> None:
    assert videos_since_last_game([_video(), _video()]) == 2


def test_zero_right_after_game() -> None:
    assert videos_since_last_game([_game(), _video()]) == 0


def test_game_threshold() -> None:
    assert not should_serve_game(VIDEOS_PER_GAME - 1)
    assert should_serve_game(VIDEOS_PER_GAME)
