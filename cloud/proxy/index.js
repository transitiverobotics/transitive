"use strict";

const os = require('os');

const port = process.env.PORT || 8000; // always 443 in production
const hostname = process.env.HOST || `${os.hostname()}.local`;
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
  registry: 'localhost:6000', // npm registry
  portal: 'localhost:9000',
  data: 'localhost:9000',
  install: 'localhost:9000/install',
  repo: 'localhost:9000/repo', // binaries we host for packages, may go away
  mqtt: 'localhost:9001', // for clients to connect to mqtt via websockets
};
const defaultTarget = 'localhost:3000';

/** route the request */
const handleRequest = (req, res) => {
  const target = routingTable[req.headers.host.split('.')[0]];
  console.log(req.headers.host, req.url, target);
  if (target) {
    proxy.web(req, res, { target: `http://${target}` });
  } else {
    proxy.web(req, res, { target: `http://${defaultTarget}` });
  }
};

/** handler for web socket upgrade */
const handleUpgrade = function(req, socket, head) {
  console.log('ws:', req.headers.host, req.url);
  const host = routingTable[req.headers.host.split('.')[0]];
  const target = `ws://${host || defaultTarget}`;
  proxy.ws(req, socket, head, {ws: true, target});
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
