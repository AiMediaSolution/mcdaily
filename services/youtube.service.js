const axios = require("axios");
const { getYoutubeKey, rotateYoutubeKey } = require("../utils/apiKeyManager");

const YT_CHANNELS_ENDPOINT = "https://www.googleapis.com/youtube/v3/channels";
const YT_PLAYLIST_ITEMS_ENDPOINT =
  "https://www.googleapis.com/youtube/v3/playlistItems";
const YT_VIDEOS_ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";

const CHANNEL_PARTS = "statistics,contentDetails";
const CHANNEL_FIELDS =
  "items(id,statistics(viewCount,subscriberCount,videoCount),contentDetails/relatedPlaylists/uploads)";

const MIN_LONG_VIDEO_SECONDS = 180;

function isValidUC(id) {
  return /^UC[a-zA-Z0-9_-]{22}$/.test(id);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function getVietnamDateString() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

function parseIsoDurationToSeconds(iso) {
  if (!iso || typeof iso !== "string") return 0;

  const match = iso.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);

  if (!match) return 0;

  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  const seconds = Number(match[4] || 0);

  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

async function requestYoutube(url, params) {
  let retries = 0;
  let lastError;

  while (retries < 5) {
    const apiKey = getYoutubeKey();

    try {
      const res = await axios.get(url, {
        params: {
          ...params,
          key: apiKey,
        },
        timeout: 10000,
      });

      return res.data;
    } catch (err) {
      lastError = err;
      rotateYoutubeKey();
      retries += 1;

      if (retries >= 5) {
        throw new Error(
          `YouTube API request failed. Last error: ${
            lastError?.response?.data?.error?.message ||
            lastError?.message ||
            "Unknown error"
          }`,
        );
      }
    }
  }
}

function getBestThumbnailDimensions(thumbnails) {
  if (!thumbnails || typeof thumbnails !== "object") return null;

  const order = ["maxres", "standard", "high", "medium", "default"];

  for (const key of order) {
    const thumb = thumbnails[key];
    const width = Number(thumb?.width);
    const height = Number(thumb?.height);

    if (width > 0 && height > 0) {
      return { width, height };
    }
  }

  return null;
}

function isVerticalVideo(thumbnails) {
  const dims = getBestThumbnailDimensions(thumbnails);

  if (!dims) {
    return false;
  }

  return dims.height > dims.width;
}

async function getLatestQualifiedLongVideo(uploadsPlaylistId) {
  if (!uploadsPlaylistId) {
    return {
      latest_long_video_id: null,
      latest_long_video_url: null,
    };
  }

  const playlistData = await requestYoutube(YT_PLAYLIST_ITEMS_ENDPOINT, {
    part: "contentDetails",
    playlistId: uploadsPlaylistId,
    maxResults: 20,
    fields: "items(contentDetails/videoId)",
  });

  const videoIds = (playlistData.items || [])
    .map((item) => item?.contentDetails?.videoId)
    .filter(Boolean);

  if (!videoIds.length) {
    return {
      latest_long_video_id: null,
      latest_long_video_url: null,
    };
  }

  const videosData = await requestYoutube(YT_VIDEOS_ENDPOINT, {
    part: "contentDetails,status,snippet",
    id: videoIds.join(","),
    fields:
      "items(id,contentDetails/duration,status/privacyStatus,snippet/thumbnails)",
  });

  const videoMap = new Map(
    (videosData.items || []).map((item) => [item.id, item]),
  );

  for (const videoId of videoIds) {
    const video = videoMap.get(videoId);
    if (!video) continue;

    const privacyStatus = video.status?.privacyStatus;
    const durationSeconds = parseIsoDurationToSeconds(
      video.contentDetails?.duration,
    );
    const isVertical = isVerticalVideo(video.snippet?.thumbnails);

    const isQualified =
      privacyStatus === "public" &&
      durationSeconds >= MIN_LONG_VIDEO_SECONDS &&
      !isVertical;

    if (isQualified) {
      return {
        latest_long_video_id: videoId,
        latest_long_video_url: `https://youtu.be/${videoId}`,
      };
    }
  }

  return {
    latest_long_video_id: null,
    latest_long_video_url: null,
  };
}

function mapItem(item, snapshotDate, latestLongVideo) {
  return {
    yt_channel_id: item.id,
    snapshot_date: snapshotDate,
    subscriber_count: Number(item.statistics?.subscriberCount) || 0,
    view_count: Number(item.statistics?.viewCount) || 0,
    video_count: Number(item.statistics?.videoCount) || 0,
    latest_long_video_id: latestLongVideo?.latest_long_video_id || null,
    latest_long_video_url: latestLongVideo?.latest_long_video_url || null,
  };
}

async function getYoutubeChannelSnapshots(channelIds, snapshotDate) {
  if (!Array.isArray(channelIds)) {
    throw new Error("channelIds must be an array");
  }

  const validIds = [...new Set(channelIds.filter(isValidUC))];
  if (!validIds.length) {
    throw new Error("No valid YouTube channel IDs provided");
  }

  const date = snapshotDate || getVietnamDateString();
  const batches = chunk(validIds, 50);
  const got = new Map();

  for (const batch of batches) {
    const channelData = await requestYoutube(YT_CHANNELS_ENDPOINT, {
      part: CHANNEL_PARTS,
      id: batch.join(","),
      fields: CHANNEL_FIELDS,
    });

    const items = channelData.items || [];

    for (const item of items) {
      const uploadsPlaylistId =
        item.contentDetails?.relatedPlaylists?.uploads || null;

      const latestLongVideo =
        await getLatestQualifiedLongVideo(uploadsPlaylistId);

      got.set(item.id, mapItem(item, date, latestLongVideo));
    }
  }

  const rows = [];
  for (const id of validIds) {
    const row = got.get(id);
    if (row) rows.push(row);
  }

  return {
    touch_channels: true,
    rows,
  };
}

module.exports = {
  getYoutubeChannelSnapshots,
};
