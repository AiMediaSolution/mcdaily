function loadKeys(prefix, max = 20) {
  const keys = [];
  for (let i = 1; i <= max; i++) {
    const value = process.env[`${prefix}_${i}`];
    if (value) {
      keys.push(value);
    } else {
      break;
    }
  }
  return keys;
}

const youtubeKeys = loadKeys("YOUTUBE_API_KEY");

let youtubeIndex = 0;

function getYoutubeKey() {
  if (!youtubeKeys.length) {
    throw new Error("No YOUTUBE_API_KEY found in environment");
  }
  return youtubeKeys[youtubeIndex];
}

function rotateYoutubeKey() {
  if (!youtubeKeys.length) {
    throw new Error("No YOUTUBE_API_KEY found in environment");
  }
  youtubeIndex = (youtubeIndex + 1) % youtubeKeys.length;
  return getYoutubeKey();
}

module.exports = {
  getYoutubeKey,
  rotateYoutubeKey,
};
