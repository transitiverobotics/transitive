'use strict';

const fs = require('fs');

/** try parsing JSON, return null if unsuccessful */
const tryJSONParse = (string) => {
  try {
    return JSON.parse(string);
  } catch (e) {
    return null;
  }
};

const host = process.env.TR_HOST;
const production = JSON.parse(process.env.PRODUCTION || 'false');

if (!host) {
  console.error('Error: No TR_HOST env var set.');
  process.exit(1);
}

console.log({host, production});

// ------------------------------------------------------------------

const proxy = require('http-proxy-node16').createProxyServer({ xfwd: true });
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
    res.statusCode = 404;
    res.end('Not found');
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
    res.statusCode = 404;
    res.end('Not found');
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

  const altnames = Object.keys(routingTable).map(prefix =>
    prefix == '' ? host : `${prefix}.${host}`)

  config.sites = [{ subject: host, altnames }];

  fs.writeFileSync('greenlock.d/config.json', JSON.stringify(config, true, 2));

  // in dev: also add altnames to /etc/hosts, so greenlock works (with fake certs)
  if (!production) {
    fs.appendFileSync('/etc/hosts',
      altnames.map(altname => `172.17.0.1 ${altname}`).join('\n'));
  }
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
      // staging: false, // `false` means production, i.e., get actual certs from Let's Encrypt
      staging: !production, // `false` means production, i.e., get actual certs from Let's Encrypt
    };
  }).ready((glx) => {

      // we need the raw https server
      const server = glx.httpsServer(null, handleRequest);
      // we'll proxy websockets too
      server.on('upgrade', handleUpgrade);
      server.listen(443, '0.0.0.0', function() {
        console.info('Listening on ', server.address());
      });

      // Note (from greenlock-express):
      // You must ALSO listen on port 80 for ACME HTTP-01 Challenges
      // (the ACME and http->https middleware are loaded by glx.httpServer)

      // Get the raw http server:
      const httpServer = glx.httpServer(function(req, res) {
        const subdomain = req.headers.host.split('.')[0];

        // for registry traffic only: forward to https
        if (subdomain == 'registry') {
          res.statusCode = 301;
          res.setHeader('Location', 'https://' + req.headers.host + req.url);
          res.end('Insecure connections are not allowed. Redirecting...');
        } else {
          res.end('Insecure connections are not allowed. Please use HTTPs.');
        }
      });
      httpServer.listen(80, '0.0.0.0', function() {
        console.info('Listening on ', httpServer.address());
      });
    });

} else {

  console.log({
    altnames: Object.keys(routingTable).map(prefix =>
      prefix == '' ? host : `${prefix}.${host}`)
  });

  // in dev we don't support SSL
  const http = require('http');
  const server = http.createServer(handleRequest);
  const port = 80;
  server.on('upgrade', handleUpgrade);
  server.listen(port);
  console.log(`listening on port ${port}`)
}
