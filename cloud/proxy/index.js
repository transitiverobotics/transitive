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
  hyperdx: `hyperdx:8080`,
  // parse env var that may list additional hosts to add
  ...tryJSONParse(process.env.TR_PROXY_ADD_HOSTS)
};

console.log('using routes', routingTable);


/** Rate limits requests based on IP:
 * maxPerPeriod: maximum number of allowed request for the specified period
 * period: period in seconds over which to apply limit
 * name: a descriptor, only used for debug output
 */
class RateLimiter {

  ipRates = {}; // per IP: requests in the preceding period
  rate = null; // max per minute
  name = null; // for debug output

  constructor(maxPerPeriod = 30, period = 300, name = undefined) {
    this.rate = maxPerPeriod;
    this.period = period;
    this.name = name;

    // Once a second: clear requests older than this.period
    setInterval(() => {
      for (let ip in this.ipRates) {
        while (this.ipRates[ip][0] < Date.now() - this.period * 1000) {
          this.ipRates[ip].shift();
        }
      }
    }, 1000);
  }

  wait(delay) {
    return new Promise((resolve) => { setTimeout(resolve, delay); });
  }

  /** check request and delay it if necessary */
  async limit(req) {
    const ip = req.socket.remoteAddress;

    // never rate limit local requests; this includes those for which we don't
    // have a remote IP, presumably because they come in through IPv6.
    if (ip.startsWith('172.')) return false;

    this.ipRates[ip] ||= [];
    let requests = this.ipRates[ip].length; // number of recent requests

    // Once the request exceed twice the limit, we just drop the requests to
    // (a) ensure we don't store too many samples per IP, to avoid mem hogging, and
    // (b) limit the number of "awaits".
    if (requests > 2 * this.rate) {
      console.log(`block ${this.name}, ${ip}`);
      return true;
    }

    // count thie request
    this.ipRates[ip].push(Date.now());
    requests++;
    console.log(`ip rate ${this.name}, ${ip}: ${requests}/${this.rate}`);

    if (requests > this.rate) {
      const delay = (this.period / this.rate) * (requests / this.rate);
      console.log(`enforcing ${this.name} rate on ${ip}, delaying: ${delay} s`);
      await this.wait(delay * 1000);
    }

    return false;
  };
}



/** Given the request, return the target `service:port` to route to */
const getTarget = (req) => {
  const subdomain = req.headers.host.split('.')[0];
  return routingTable[subdomain] || routingTable[''];
};

// const httpRateLimiter = new RateLimiter(50, 60, 'http');

/** route the request */
const handleRequest = async (req, res) => {
  // await httpRateLimiter.limit(req);
  const target = getTarget(req);
  if (!target) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  console.log(`${req.socket.remoteAddress}: ${req.headers.host}${req.url} -> ${target}`);
  proxy.web(req, res, { target: `http://${target}` });
};

// rate limit ws requests
const wsRateLimiter = new RateLimiter(240, 720, 'ws');

/** handler for web socket upgrade */
const handleUpgrade = async (req, socket, head) => {
  console.log(`ws: ${req.socket.remoteAddress}: ${req.headers.host}${req.url}`);
  const block = await wsRateLimiter.limit(req);
  if (block) {
    // the rate limiter wants us to drop this request
    req.destroy();
    return;
  }

  const target = getTarget(req);
  if (!target) {
    req.destroy();
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
