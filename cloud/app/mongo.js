const MongoClient = require('mongodb').MongoClient;

// const URL = 'mongodb://localhost:27017';
// const DB_NAME = 'transitive';
const URL = 'mongodb://localhost:3001';
const DB_NAME = 'meteor';

class Mongo {

  init() {
    this.client = new MongoClient(URL);

    // Use connect method to connect to the server
    this.client.connect((err) => {
      if (!err) {
        console.log('Connected successfully to mongodb server');
        this._db = this.client.db(DB_NAME);
      } else {
        console.error('Error connecting to mongodb', err);
      }
    });
  }

  close() {
    this.client.close();
  }

  get db() {
    if (this._db == undefined) {
      console.warn('Cannot access DB before init() is called');
    }
    return this._db;
  }
}

const instance = new Mongo;
module.exports = instance;
