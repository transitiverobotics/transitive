"use strict";

const os = require('os');
const fs = require('fs');

const port = process.env.PORT || 8000; // always 443 in production
const hostname = process.env.HOST || `${os.hostname()}.local`;
const production = process.env.PRODUCTION ?
  JSON.parse(process.env.PRODUCTION) : false;
const dockerCompose = process.env.DOCKER_COMPOSE ?
  JSON.parse(process.env.DOCKER_COMPOSE) : false;
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

const routingTable = dockerCompose ? {
    registry: 'registry:6000', // npm registry
    portal: 'cloud:9000',
    data: 'cloud:9000',
    auth: 'cloud:9000',
    install: 'cloud:9000/install',
    repo: 'cloud:9000/repo', // binaries we host for packages, may go away
    mqtt: 'mosquitto:9001', // for clients to connect to mqtt via websockets
    billing: 'billing:7000', // billing portal: only run by Transitive Robotics
    default: 'homepage:3000'
  } : { // when not started via docker-compose (for local dev):
    registry: 'localhost:6000',
    portal: 'localhost:9000',
    data: 'localhost:9000',
    auth: 'localhost:9000',
    install: 'localhost:9000/install',
    repo: 'localhost:9000/repo',
    mqtt: 'localhost:9001',
    billing: 'localhost:7000',
    default: 'localhost:3000'
  };

const pathTable = {
  // '/billing': 'billing:7000'
};

/** route the request */
const handleRequest = (req, res) => {
  const hostname = req.headers.host.split(':')[0];

  let target = routingTable.default;
  const pathMatch = Object.keys(pathTable).find(path => req.url.startsWith(path));
  const hostMatch = routingTable[hostname.split('.')[0]];
  if (pathMatch) {
    target = pathTable[pathMatch];
    req.url = req.url.slice(pathMatch.length);
  } else if (hostMatch) {
    target = hostMatch;
  }

  console.log(`${req.socket.remoteAddress}: ${req.headers.host}${req.url} -> ${target}`);
  if (target) {
    proxy.web(req, res, { target: `http://${target}` });
  } else {
    proxy.web(req, res, { target: `http://${routingTable.default}` });
  }
};

/** handler for web socket upgrade */
const handleUpgrade = function(req, socket, head) {
  console.log('ws:', req.headers.host, req.url);
  const host = routingTable[req.headers.host.split('.')[0]];
  const target = `ws://${host || routingTable.default}`;
  proxy.ws(req, socket, head, {ws: true, target});
};


// -----------------------------------------------------------------------

/** update ./greenlock.d/config.json using HOST for the hostname suffixes */
const updateConfig = () => {
  fs.mkdirSync('greenlock.d', {recursive: true});
  let config = {};
  try {
    // If the file exists, read it and update it. This is important, because
    // greenlock-express updates that file with additional data regarding
    // renewals.
    const buffer = fs.readFileSync('greenlock.d/config.json');
    config = JSON.parse(buffer.toString());
  } catch (e) {}

  config.sites = [{
    subject: host,
    altnames: Object.keys(routingTable).map(prefix =>
      prefix == 'default' ? host : `${prefix}.${host}`)
  }];

  fs.writeFileSync('greenlock.d/config.json', JSON.stringify(config, true, 2));
};

// -----------------------------------------------------------------------


if (production) {
  // in production we use greenlock-express as the server to terminate SSL requests

  updateConfig();

  require("greenlock-express").init(() => {
    // Greenlock Config
    return {
      packageRoot: __dirname,
      configDir: `./greenlock.d`,
      maintainerEmail: process.env.TR_SSL_EMAIL,
      cluster: false,
      staging: false, // false == production, i.e., get actual certs from Let's Encrypt
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
