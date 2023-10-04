'use strict';

const os = require('os');
const fs = require('fs');

/** try parsing JSON, return null if unsuccessful */
const tryJSONParse = (string) => {
  try {
    return JSON.parse(string);
  } catch (e) {
    return null;
  }
};

const port = process.env.PORT || 8000; // always 443 in production
const hostname = process.env.HOST || `${os.hostname()}.local`;
const production = process.env.PRODUCTION ?
  JSON.parse(process.env.PRODUCTION) : false;
const host = production ? hostname : `${hostname}:${port}`;

console.log({host, production});

// ------------------------------------------------------------------

const proxy = require('http-proxy').createProxyServer({ xfwd: true });
// catches error events during proxying
proxy.on('error', function(err, req, res) {
  console.error(err);
  res.statusCode = 500;
  res.end();
  return;
});

// -----------------------------------------------------------------------
// Routing logic

const routingTable = {
  registry: 'registry:6000', // npm registry
  portal: 'cloud:9000',
  data: 'cloud:9000',
  auth: 'cloud:9000',
  install: 'cloud:9000/install',
  repo: 'cloud:9000/repo', // binaries we host for packages, may go away
  mqtt: 'mosquitto:9001', // for clients to connect to mqtt via websockets
  // parse env var that may list additional hosts to add
...tryJSONParse(process.env.TR_PROXY_ADD_HOSTS)
};

console.log('using routes', routingTable);

/** Given the request, return the target `service:port` to route to */
const getTarget = (req) => {
  const subdomain = req.headers.host.split('.')[0];
  return routingTable[subdomain] || routingTable[''];
};

/** route the request */
const handleRequest = (req, res) => {
  const target = getTarget(req);
  if (!target) {
    res.status(404).send('Not found');
    return;
  }
  console.log(`${req.socket.remoteAddress}: ${req.headers.host}${req.url} -> ${target}`);
  proxy.web(req, res, { target: `http://${target}` });
};

/** handler for web socket upgrade */
const handleUpgrade = function(req, socket, head) {
  console.log('ws:', req.headers.host, req.url);
  const target = getTarget(req);
  if (!target) {
    res.status(404).send('Not found');
    return;
  }
  proxy.ws(req, socket, head, {ws: true, target: `ws://${target}`});
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
      prefix == '' ? host : `${prefix}.${host}`)
  }];

  fs.writeFileSync('greenlock.d/config.json', JSON.stringify(config, true, 2));
};

// -----------------------------------------------------------------------


if (production) {
  // in production we use greenlock-express as the server to terminate SSL requests

  updateConfig();

  require('greenlock-express').init(() => {
    // Greenlock Config
    return {
      packageRoot: __dirname,
      configDir: `./greenlock.d`,
      maintainerEmail: process.env.TR_SSL_EMAIL,
      cluster: false,
      staging: false, // `false` means production, i.e., get actual certs from Let's Encrypt
    };
  }).ready((glx) => {
      // we need the raw https server
      const server = glx.httpsServer();
      // we'll proxy websockets too
      server.on('upgrade', handleUpgrade);
      // serves a node app that proxies requests
      glx.serveApp(handleRequest);
    }
  );

} else {

  console.log({
    altnames: Object.keys(routingTable).map(prefix =>
      prefix == '' ? host : `${prefix}.${host}`)
  });

  // in dev we don't support SSL
  const http = require('http');
  const server = http.createServer(handleRequest);
  server.on('upgrade', handleUpgrade);
  server.listen(port);
  console.log(`listening on port ${port}`)
}
