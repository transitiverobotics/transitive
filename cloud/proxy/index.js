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
  default: 'localhost:3000'
};

const handleRequest = (req, res) => {
  console.log(req.headers.host, req.url);
  const target = `http://${routingTable[req.headers.host] || routingTable.default}`;
  proxy.web(req, res, { target });
};

/** handler for web socket upgrade */
const handleUpgrade = function(req, socket, head) {
  console.log('ws:', req.headers.host, req.url);
  const target = `ws://${routingTable[req.headers.host] || routingTable.default}`;
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
