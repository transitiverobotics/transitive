
const fs = require('fs');
const http = require('http');
const exec = require('child_process').exec;

const constants = require('./constants');

const SOCKET_FILE = `${constants.TRANSITIVE_DIR}/run/localApi.socket`;

let server;

const readRequest = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', (chunk) => {
    data += chunk;
  });
  req.on('error', reject);
  req.on('end', () => {
    resolve(data);
  });
});

const handlers = {

  /** Example invocation:
  curl --unix-socket localApi.socket -i -d '{"command": "install", "packages": ["ros-noetic-wireless-msgs"]}' http://ignore
  */
  install: ({packages}, res) => {
    console.log('install packages', packages);
    exec(`${constants.TRANSITIVE_DIR}/usr/bin/aptLocal.sh ${packages.join(' ')}`,
      (err, stdout, stderr) => {
        if (err) {
          res.statusCode = 500;
          res.end(`Failed to install packages: ${err}`);
        } else {
          console.log(stdout);
          if (stderr) {
            res.statusCode = 400;
            console.log(stderr);
            res.end(`Unable to install packages: ${stderr}`);
          } else {
            res.end();
          }
        }
      });
  }
};

const handleRequest = ({command, ...args}, res) => {
  handlers[command]
  ? handlers[command](args, res)
  : console.warn('unknown command', command);
};

module.exports = {
  startServer: () => {
    server = http.createServer(async (req, res) => {
      console.log(req.url);
      const body = await readRequest(req);
      try {
        handleRequest(JSON.parse(body), res);
      } catch (e) {
        res.statusCode = 400;
        res.end(`Unable to parse request: ${e}`);
      }
    });

    fs.unlink(SOCKET_FILE, () => server.listen(SOCKET_FILE));
  },
};
