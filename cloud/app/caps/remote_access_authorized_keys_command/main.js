#!/usr/bin/env node

/* This would be nice but doesn't work when called from outside of directory:
#!/usr/bin/env -S node -r dotenv/config
*/

require('dotenv').config({path: `${__dirname}/.env`});

const MongoClient = require('mongodb').MongoClient;

const URL = process.env.MONGO_URL || 'mongodb://localhost:3001';
const DB_NAME = process.env.MONGO_DB || 'meteor';

const fetchKeys = async () => {
  const client = new MongoClient(URL, {useUnifiedTopology: true});
  await client.connect();
  const db = client.db(DB_NAME);
  const deviceCollection = db.collection('devices');

  await deviceCollection.find({$or: [
      {'remote_access.publicKey': {$exists: true}},
      {'video_streaming.publicKey': {$exists: true}}
    ]}, {projection: {'remote_access.publicKey': 1, 'video_streaming.publicKey': 1}}
  ).forEach(device => {
    device.remote_access && device.remote_access.publicKey &&
      console.log(device.remote_access.publicKey.trim());
    device.video_streaming && device.video_streaming.publicKey &&
      console.log(device.video_streaming.publicKey.trim());
  });

  client.close();
};


if (process.argv[2] == 'tunnel') {
  // this is only for the 'tunnel' user, ignore all others
  fetchKeys();
}
