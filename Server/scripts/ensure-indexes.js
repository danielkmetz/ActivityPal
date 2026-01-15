require("dotenv").config();
const mongoose = require("mongoose");
require("../models/Events");
require("../models/Promotions");

async function run() {
  const mongoUser = encodeURIComponent(process.env.MONGO_USER || "");
  const mongoPass = encodeURIComponent(process.env.MONGO_PASS || "");
  const host = process.env.MONGO_HOST || "";
  const db = process.env.MONGO_DB || "";
  const opts = process.env.MONGO_OPTIONS || "retryWrites=true&w=majority";
  const dbURI = `mongodb+srv://${mongoUser}:${mongoPass}@${host}/${db}?${opts}`;

  await mongoose.connect(dbURI);

  // Forces MongoDB to create all declared schema indexes
  await mongoose.connection.db.command({ ping: 1 });

  const models = mongoose.models;
  for (const name of Object.keys(models)) {
    await models[name].syncIndexes(); // safer than ensureIndexes
  }

  console.log("✅ Index sync complete");
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error("❌ Index sync failed:", e);
  process.exit(1);
});
