"""Unit tests for lightning detection pipeline."""

import shutil
from pathlib import Path
import numpy as np
import pytest

from src.lightning_pipeline import (
    extract_lightning_bboxes,
    calculate_strike_intervals,
    create_synthetic_lightning_video,
    extract_video_clips,
    detect_lightning_in_video,
    process_video_pipeline,
)


def test_extract_lightning_bboxes_bright_stroke():
    """Verify that a synthetic bright strike generates valid normalized YOLO bounding boxes."""
    img = np.zeros((256, 256, 3), dtype=np.uint8)
    img[50:200, 120:130] = 255

    bboxes = extract_lightning_bboxes(img, min_area=20, intensity_threshold=180)
    assert len(bboxes) >= 1
    xc, yc, w, h = bboxes[0]
    assert 0.0 <= xc <= 1.0
    assert 0.0 <= yc <= 1.0
    assert 0.0 < w <= 1.0
    assert 0.0 < h <= 1.0


def test_calculate_strike_intervals_isolated():
    """Verify that an isolated strike receives +1.0s buffer at start and end."""
    timestamps = [5.0]
    intervals = calculate_strike_intervals(timestamps, video_duration=10.0, buffer_seconds=1.0)
    assert intervals == [(4.0, 6.0)]


def test_calculate_strike_intervals_clamping_start_and_end():
    """Verify boundary clamping at 0.0s and video_duration."""
    timestamps = [0.4, 9.7]
    intervals = calculate_strike_intervals(timestamps, video_duration=10.0, buffer_seconds=1.0)
    assert len(intervals) == 2
    assert intervals[0] == (0.0, 1.4)
    assert intervals[1] == (8.7, 10.0)


def test_calculate_strike_intervals_overlapping_merging():
    """Verify that overlapping buffered intervals are merged cleanly into one."""
    timestamps = [3.0, 4.5]
    intervals = calculate_strike_intervals(timestamps, video_duration=10.0, buffer_seconds=1.0)
    assert len(intervals) == 1
    assert intervals[0] == (2.0, 5.5)


def test_calculate_strike_intervals_empty():
    """Verify handling when no lightning is detected."""
    assert calculate_strike_intervals([], video_duration=10.0) == []


def test_synthetic_video_and_clip_extraction(tmp_path: Path):
    """Verify synthetic video generation and video clip slicing."""
    test_video = tmp_path / "test_storm.mp4"
    create_synthetic_lightning_video(test_video, duration_sec=3.0, fps=20, strike_times=(1.0,))
    assert test_video.exists()

    clips_out = tmp_path / "output_clips"
    clips = extract_video_clips(test_video, [(0.5, 1.8)], output_dir=clips_out)
    assert len(clips) == 1
    assert clips[0].exists()
    assert clips[0].stat().st_size > 0


def test_process_video_pipeline_synthetic(tmp_path: Path):
    """End-to-end integration test of video detection, interval buffer, and clip export."""
    test_video = tmp_path / "storm_pipeline.mp4"
    create_synthetic_lightning_video(test_video, duration_sec=4.0, fps=20, strike_times=(1.5,))

    weights_path = Path("models/lightning_yolo.pt")
    if weights_path.exists():
        result = process_video_pipeline(
            video_path=test_video,
            model_path=weights_path,
            output_dir=tmp_path / "event_clips",
            conf_threshold=0.35,
            buffer_seconds=1.0,
            frame_stride=2,
        )
        assert "metadata" in result
        assert result["metadata"]["duration_seconds"] == 4.0
        assert "intervals" in result
        assert "clips" in result


def test_real_no_lightning_video_false_positive_rejection():
    """Verify that a real negative video (No Lightning.mp4) produces zero false-positive strikes."""
    no_lightning_path = Path("tests/videos/no_lightning.mp4")
    if not no_lightning_path.exists():
        pytest.skip("tests/videos/no_lightning.mp4 not found")

    weights_path = Path("models/lightning_yolo.pt")
    if not weights_path.exists():
        pytest.skip("models/lightning_yolo.pt not found")

    timestamps, meta = detect_lightning_in_video(
        video_path=no_lightning_path,
        model=weights_path,
        conf_threshold=0.35,
        frame_stride=2,
    )

    # Must produce 0 false-positive timestamps and 0 intervals
    assert len(timestamps) == 0, f"Expected 0 false positives, got: {timestamps}"
    intervals = calculate_strike_intervals(timestamps, meta["duration_seconds"])
    assert len(intervals) == 0


def test_real_lightning_video_detection_and_slicing(tmp_path: Path):
    """Verify that real lightning video (Lightning.mp4) detects strikes and extracts clips."""
    lightning_path = Path("tests/videos/lightning.mp4")
    if not lightning_path.exists():
        pytest.skip("tests/videos/lightning.mp4 not found")

    weights_path = Path("models/lightning_yolo.pt")
    if not weights_path.exists():
        pytest.skip("models/lightning_yolo.pt not found")

    timestamps, meta = detect_lightning_in_video(
        video_path=lightning_path,
        model=weights_path,
        conf_threshold=0.35,
        frame_stride=3,  # Fast sampling for CI
    )

    # Must detect strikes across the video
    assert len(timestamps) > 0, "Failed to detect lightning strikes in Lightning.mp4"

    intervals = calculate_strike_intervals(
        detected_timestamps=timestamps,
        video_duration=meta["duration_seconds"],
        buffer_seconds=1.0,
    )
    assert len(intervals) > 0, "No intervals created for detected strikes"

    # Verify each interval satisfies +1.0s buffer properties
    for start_t, end_t in intervals:
        assert start_t >= 0.0
        assert end_t <= meta["duration_seconds"]
        assert end_t > start_t

    # Slicing test on first detected interval
    sliced_clips = extract_video_clips(
        video_path=lightning_path,
        intervals=[intervals[0]],
        output_dir=tmp_path / "lightning_clips",
    )
    assert len(sliced_clips) == 1
    assert sliced_clips[0].exists()
    assert sliced_clips[0].stat().st_size > 0
