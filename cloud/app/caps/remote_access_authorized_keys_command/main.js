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

  await deviceCollection.find({'remote_access.publicKey': {$exists: true}},
    {projection: {'remote_access.publicKey': true}}
  ).forEach(device => console.log(device.remote_access.publicKey.trim()));

  client.close();
};


if (process.argv[2] == 'tunnel') {
  // this is only for the 'tunnel' user
  fetchKeys();
}
