"use strict";

const port = process.env.PORT || 8000; // always 443 in production
const hostname = process.env.HOST || 'localhost';
const production = !!process.env.PRODUCTION;
const host = production ? hostname : `${hostname}:${port}`;

console.log({host, production});

// ------------------------------------------------------------------

const proxy = require("http-proxy").createProxyServer({ xfwd: true });
// catches error events during proxying
proxy.on("error", function(err, req, res) {
  console.error(err);
  res.statusCode = 500;
  res.end();
  return;
});

// -----------------------------------------------------------------------
// Routing logic

const routingTable = {
  [`install.${host}`]: 'localhost:3000/install',
  [`registry.${host}`]: 'localhost:6000',
  [`data.${host}`]: 'localhost:9000', // Note: this is for websocket traffic, not mqtt
  [`repo.${host}`]: 'localhost:9000/repo'
};
const defaultTarget = 'localhost:3000';

/** route the request */
const handleRequest = (req, res) => {
  console.log(req.headers.host, req.url);
  const target = routingTable[req.headers.host];
  if (target) {
    proxy.web(req, res, { target: `http://${target}` });

  } else if (req.headers.host == `video.${host}`) {
    const params = new URLSearchParams(req.url.slice(req.url.indexOf('?')));
    const userId = params.get('userid');

    if (params.get('jwt') && userId) {
      // Verify the provided JWT using secret from the user DB
      verifyJWT(params.get('jwt'), userId, (err, payload) => {
        if (err) {
          res.end('authorization failed');
          return;
        }
        if (payload.capability != 'video-streaming') {
          res.end('authorization is for a different capability');
          return;
        }
        proxy.web(req, res, {target:
          {socketPath: `/tmp/ssh_video.${userId}.${payload.device}.socket`}});
      });
    } else {
      res.end('missing authorization');
    }

  } else {
    // default
    proxy.web(req, res, { target: `http://${defaultTarget}` });
  }
};

/** handler for web socket upgrade */
const handleUpgrade = function(req, socket, head) {
  console.log('ws:', req.headers.host, req.url);
  const target = `ws://${routingTable[req.headers.host] || defaultTarget}`;
  proxy.ws(req, socket, head, {ws: true, target});
};

// -----------------------------------------------------------------------
// Authentication

const MongoClient = require('mongodb').MongoClient;
const jwt = require('jsonwebtoken');

const URL = process.env.MONGO_URL || 'mongodb://localhost:3001';
const DB_NAME = process.env.MONGO_DB || 'meteor';
const mongo = new MongoClient(URL, {useUnifiedTopology: true});
let db;
mongo.connect((err) => {
  if (!err) {
    console.log('Connected successfully to mongodb server');
    db = mongo.db(DB_NAME);
  } else {
    console.error('Error connecting to mongodb', err);
  }
});


/** TODO: merge this with code in cloud/app/server.js (into utils) */
const verifyJWT = (token, id, callback) => {
  if (!db) {
    console.log('Not yet connected to DB, unable to authenticate');
    return false;
  }

  const cbWithMessage = (err, payload) => {
    err && console.log(err);
    callback(err, payload);
  };

  db.collection('users').findOne({_id: id}, (err, doc) => {
    if (err || !doc) {
      cbWithMessage(
        'no such user, please verify the id provided to the web component')
    } else {
      console.log('from db:', err, doc);
      if (!doc.jwt_secret) {
        cbWithMessage('user has no jwt secret yet, please visit the portal')
      } else {
        jwt.verify(token, doc.jwt_secret, (err, payload) => {
          if (err) {
            cbWithMessage('Unable to verify JWT token');
          } else {
            if (payload.validity &&
              (payload.iat + payload.validity) * 1e3 > Date.now()) {
              cbWithMessage(null, payload);
            } else {
              cbWithMessage(`JWT is expired ${JSON.stringify(payload)}`);
            }
          }
        });
      }
    }
  });
};

// -----------------------------------------------------------------------


if (production) {
  // in production we use greenlock-express as the server to terminate SSL requests

  require("greenlock-express").init(() => {
    // Greenlock Config
    return {
      packageRoot: __dirname,
      configDir: `${process.env.HOME}/etc/greenlock.d`,
      maintainerEmail: "christian@transitiverobotics.com",
      cluster: false,
      staging: false, // false == production: get actual certs from Let's Encrypt
    };
  }).ready((glx) => {
      // we need the raw https server
      const server = glx.httpsServer();

      // We'll proxy websockets too
      server.on("upgrade", handleUpgrade);

      // servers a node app that proxies requests
      glx.serveApp(handleRequest);
    }
  );

} else {

  // in dev we don't support SSL
  const http = require('http');
  const server = http.createServer(handleRequest);
  server.on('upgrade', handleUpgrade);
  server.listen(port);
  console.log(`listening on port ${port}`)
}
