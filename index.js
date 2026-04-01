require("dotenv").config();
const cron = require("node-cron");
const { syncYoutubeSnapshots } = require("./jobs/syncYoutubeSnapshots");

const cronTime = process.env.CRON_TIME || "0 1 * * *";

console.log(`[cron] Scheduled with CRON_TIME=${cronTime}`);

// chạy ngay 1 lần khi start app
syncYoutubeSnapshots();

// chạy theo lịch
cron.schedule(cronTime, async () => {
  console.log(`[cron] Running job at ${new Date().toISOString()}`);
  await syncYoutubeSnapshots();
});
