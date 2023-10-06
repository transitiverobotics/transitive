'use strict';

const os = require('os');
const net = require('net');
const mdns = require('multicast-dns')();

const host = process.env.TR_HOST || `${os.hostname()}.local`;

// ------------------------------------------------------------------
// Start mDNS service to enable all subdomains of `host`.
//

/** find out which of our network interfaces is being used for accessing the
Internet. Basically a poor-man's version of `ip route get SOME-IP`, but native.
*/
const getInternetIP = () => {
  return new Promise((resolve, reject) => {
    const socket = net.connect({host: 'google.com', port: 80});
    socket.on('connect', () => {
      const {address} = socket.address();
      resolve(address);
    });
    socket.on('timeout', reject);
    socket.on('error', reject);
  });
};

const startMDNS = async () => {

  // find out which IP we use to the outside world
  const ip = await getInternetIP();

  console.log(`Starting mDNS service to point all subdomains *.${host} to ${ip}.`);

  mdns.on('query', function(query) {
    const name = query.questions[0].name;
    name?.endsWith(host) && mdns.respond({
      answers: [{
        name,
        type: 'A',
        ttl: 300,
        data: ip
      }]
    });
  });
};

startMDNS();
