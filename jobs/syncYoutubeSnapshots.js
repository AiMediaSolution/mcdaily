const axios = require("axios");
const { getYoutubeChannelSnapshots } = require("../services/youtube.service");

async function fetchChannelIdsFromDataApi() {
  const dataApiUrl = process.env.DATA_API_URL;
  const xApiKey = process.env.X_API_KEY;

  if (!dataApiUrl) {
    throw new Error("Missing DATA_API_URL in environment");
  }

  if (!xApiKey) {
    throw new Error("Missing X_API_KEY in environment");
  }

  const response = await axios.get(dataApiUrl, {
    headers: {
      "x-api-key": xApiKey,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });

  const items = response.data?.data;
  if (!Array.isArray(items)) {
    throw new Error("DATA_API_URL response.data.data must be an array");
  }

  return items.map((item) => item?.yt_channel_id).filter(Boolean);
}

async function postSnapshotsToApi(payload) {
  const apiUrl = process.env.API_URL;
  const xApiKey = process.env.X_API_KEY;

  if (!apiUrl) {
    throw new Error("Missing API_URL in environment");
  }

  if (!xApiKey) {
    throw new Error("Missing X_API_KEY in environment");
  }

  const response = await axios.post(apiUrl, payload, {
    headers: {
      "x-api-key": xApiKey,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });

  return response.data;
}

async function syncYoutubeSnapshots() {
  try {
    const channelIds = await fetchChannelIdsFromDataApi();

    if (!channelIds.length) {
      console.log(
        "[syncYoutubeSnapshots] No channel ids returned from DATA_API_URL",
      );
      return;
    }

    const payload = await getYoutubeChannelSnapshots(channelIds);

    if (!payload.rows.length) {
      console.log(
        "[syncYoutubeSnapshots] No snapshot rows returned from YouTube",
      );
      return;
    }

    const result = await postSnapshotsToApi(payload);

    console.log("[syncYoutubeSnapshots] Success");
    console.log(
      JSON.stringify(
        {
          total_channels: channelIds.length,
          total_rows: payload.rows.length,
          post_result: result,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error("[syncYoutubeSnapshots] Failed:", error.message);
  }
}

module.exports = {
  syncYoutubeSnapshots,
};
