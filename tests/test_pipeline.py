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
    process_video_pipeline,
)


def test_extract_lightning_bboxes_bright_stroke():
    """Verify that a synthetic bright strike generates valid normalized YOLO bounding boxes."""
    # Create black 256x256 image
    img = np.zeros((256, 256, 3), dtype=np.uint8)
    # Draw bright white vertical stroke in center
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
    # Near beginning (0.4s) and near end (9.7s in a 10s video)
    timestamps = [0.4, 9.7]
    intervals = calculate_strike_intervals(timestamps, video_duration=10.0, buffer_seconds=1.0)
    assert len(intervals) == 2
    assert intervals[0] == (0.0, 1.4)
    assert intervals[1] == (8.7, 10.0)


def test_calculate_strike_intervals_overlapping_merging():
    """Verify that overlapping buffered intervals are merged cleanly into one."""
    # 3.0s (buffered: 2.0 -> 4.0) and 4.5s (buffered: 3.5 -> 5.5).
    # Since 3.5 <= 4.0, these should merge into [2.0, 5.5].
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
    # Create test video with lightning strikes at 1.5s
    test_video = tmp_path / "storm_pipeline.mp4"
    create_synthetic_lightning_video(test_video, duration_sec=4.0, fps=20, strike_times=(1.5,))

    # We can test detection with a mock function or the trained model
    weights_path = Path("models/lightning_yolo.pt")
    if weights_path.exists():
        result = process_video_pipeline(
            video_path=test_video,
            model_path=weights_path,
            output_dir=tmp_path / "event_clips",
            conf_threshold=0.1,
            buffer_seconds=1.0,
            frame_stride=2
        )
        assert "metadata" in result
        assert result["metadata"]["duration_seconds"] == 4.0
        assert "intervals" in result
        assert "clips" in result
