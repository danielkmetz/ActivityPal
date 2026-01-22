const { createClient } = require("redis");

let client;
let connecting;
let loggedReady = false;

async function getRedisClient() {
  if (client?.isOpen) return client;

  if (!client) {
    client = createClient({ url: process.env.REDIS_URL });

    client.on("error", (err) => console.log("Redis Client Error", err));

    // Helpful lifecycle logs (won’t spam)
    client.on("connect", () => console.log("Redis: socket connected"));
    client.on("reconnecting", () => console.log("Redis: reconnecting..."));
    client.on("end", () => console.log("Redis: connection closed"));
  }

  if (!connecting) {
    connecting = client.connect().catch((err) => {
      connecting = null; // allow retry later
      loggedReady = false;
      throw err;
    });
  }

  await connecting;

  if (!loggedReady) {
    loggedReady = true;
    try {
      const url = new URL(process.env.REDIS_URL);
      console.log(`Redis: ready (${url.hostname}:${url.port || "?"})`);
    } catch {
      console.log("Redis: ready");
    }
  }

  return client;
}

module.exports = { getRedisClient };
