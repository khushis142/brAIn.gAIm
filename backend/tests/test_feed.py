from app.feed import VIDEOS_PER_GAME, should_serve_game, videos_since_last_game


def test_counts_videos_until_most_recent_game() -> None:
    assert videos_since_last_game(["video", "video", "game", "video"]) == 2


def test_counts_all_when_no_game() -> None:
    assert videos_since_last_game(["video", "video"]) == 2


def test_zero_right_after_game() -> None:
    assert videos_since_last_game(["game", "video"]) == 0


def test_game_threshold() -> None:
    assert not should_serve_game(VIDEOS_PER_GAME - 1)
    assert should_serve_game(VIDEOS_PER_GAME)
