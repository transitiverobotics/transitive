// enable replica set if not yet enabled
rs.initiate({
  _id: 'rs0',
  version: 1,
  members: [{_id: 0, host: '127.0.0.1:27017'}]
})
