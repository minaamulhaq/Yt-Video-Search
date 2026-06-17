const mongoose = require('mongoose');

const uri = "mongodb+srv://admin:inamulhaq@cluster0.f3wtsnr.mongodb.net/test";

async function main() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri);
  console.log("Connected.");
  
  const db = mongoose.connection.db;
  const collection = db.collection('videos');
  
  console.log("Existing indexes:");
  const indexes = await collection.indexes();
  console.log(indexes);
  
  const hasVideoIdIndex = indexes.some(idx => idx.name === 'videoId_1');
  if (hasVideoIdIndex) {
    console.log("Dropping videoId_1 index...");
    await collection.dropIndex('videoId_1');
    console.log("Index dropped successfully!");
  } else {
    console.log("No videoId_1 index found.");
  }
  
  await mongoose.disconnect();
  console.log("Disconnected.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
