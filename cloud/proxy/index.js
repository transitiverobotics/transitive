"use strict";

// set in prod environment
const host = process.env.HOST || 'localhost:8000';
const production = !!process.env.PRODUCTION;

console.log({host, production});

// const proxy = require('redbird')({
//   port: production ? 80 : 8000,
//   letsencrypt: {
//     path: __dirname + '/certs',
//     port: 9999, // LetsEncrypt minimal web server port for handling challenges. Routed 80->9999, no need to open 9999 in firewall. Default 3000 if not defined.
//   },
//   ssl: {
//     http2: true,
//     port: production ? 443 : 8443, // SSL port used to serve registered https routes with LetsEncrypt certificate.
//   }
// });
//
//
// const options = production ? {
//   ssl: {
//     letsencrypt: {
//       email: 'christian@transitiverobotics.com',
//       production, // WARNING: Only use this flag when the proxy is verified to work correctly to avoid being banned!
//     }
//   }
// } : {};
//
// proxy.register(domain, "http://localhost:3000", options);
// proxy.register(`install.${domain}`, "http://localhost:3000/install", options);

// ------------------------------------------------------------------

const proxy = require("http-proxy").createProxyServer({ xfwd: true });
// catches error events during proxying
proxy.on("error", function(err, req, res) {
  console.error(err);
  res.statusCode = 500;
  res.end();
  return;
});


const handleRequest = (req, res) => {
  console.log(req.headers, req.url);
  // TODO: add switch-board logic here, see
  // https://www.npmjs.com/package/http-proxy#node-http-proxy
  if (req.headers.host == `install.${host}`) {
    proxy.web(req, res, { target: "http://localhost:3000/install" });

  } else if (req.headers.host == `registry.${host}`) {
    proxy.web(req, res, { target: "http://localhost:6000" });

  } else {
    // default
    proxy.web(req, res, { target: "http://localhost:3000" });
  }
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
      staging: false, // production: get actual certs from Let's Encrypt
    };
  }).ready((glx) => {
      // we need the raw https server
      const server = glx.httpsServer();

      // We'll proxy websockets too
      server.on("upgrade", function(req, socket, head) {
        proxy.ws(req, socket, head, {
          ws: true,
          target: "ws://localhost:9000" // cloud app
        });
      });

      // servers a node app that proxies requests
      glx.serveApp(handleRequest);
    }
  );

} else {

  // in dev we don't support SSL
  const http = require('http');
  const server = http.createServer(handleRequest);
  server.on('upgrade', function(req, socket, head) {
    // TODO: may need to replicate switch-board logic here
    proxy.ws(req, socket, head, { target: "http://localhost:3000" });
  });
  console.log("listening on port 8000")
  server.listen(8000);
}
