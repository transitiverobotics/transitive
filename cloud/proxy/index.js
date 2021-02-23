// set in prod environment
const domain = process.env.DOMAIN || 'localhost';
const production = !!process.env.PRODUCTION;

const proxy = require('redbird')({
  port: production ? 80 : 8000,
  letsencrypt: {
    path: __dirname + '/certs',
    port: 9999, // LetsEncrypt minimal web server port for handling challenges. Routed 80->9999, no need to open 9999 in firewall. Default 3000 if not defined.
    email: 'christian@transitiverobotics.com',
    production, // WARNING: Only use this flag when the proxy is verified to work correctly to avoid being banned!
  },
  ssl: {
    http2: true,
    port: production ? 443 : 8443, // SSL port used to serve registered https routes with LetsEncrypt certificate.
  }
});


const options = {
  // ssl: {
  //   letsencrypt: {
  //     email: 'christian@transitiverobotics.com',
  //     production, // WARNING: Only use this flag when the proxy is verified to work correctly to avoid being banned!
  //   }
  // }
};

proxy.register(domain, "http://localhost:3000", options);
proxy.register(`install.${domain}`, "http://localhost:3000/install", options);

//
// LetsEncrypt requires a minimal web server for handling the challenges, this is by default on port 3000
// it can be configured when initiating the proxy. This web server is only used by Redbird internally so most of the time
// you  do not need to do anything special other than avoid having other web services in the same host running
// on the same port.
