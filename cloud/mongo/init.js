// enable replica set if not yet enabled
rs.initiate({
  _id: 'rs0',
  version: 1,
  members: [{
    _id: 0,
    host: 'mongodb:27017'
    // Apparently this needs to be a name known to all clients, i.e., can't
    // be 127.0.0.1. Otherwise clients must use `directConnection`.
  }]
})
