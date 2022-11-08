
const fs = require('fs');
const http = require('http');
const exec = require('child_process').exec;

const constants = require('./constants');
const {weHaveSudo} = require('./utils');

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

  /** Install the given list of apt packages. Example invocation:
  curl --unix-socket localApi.socket -i -d '{"command": "install", "packages": ["ros-noetic-wireless-msgs"]}' http://ignore
  */
  install: ({packages}, res) => {
    console.log('install packages', packages);
    const aptCmd = (process.getuid() == 0 ?
      // we are root, let's use it
      'apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y' :
      (weHaveSudo() ?
        // we have passwordless sudo, let's use that
        'sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y' :
        // we have neither, use aptLocal.sh
        `${constants.TRANSITIVE_DIR}/bin/aptLocal.sh`
      )
    );
    exec(`${aptCmd} ${packages.join(' ')}`,
      (err, stdout, stderr) => {
        if (err) {
          res.statusCode = 500;
          res.end(`Failed to install packages: ${err}`);
        } else {
          console.log(stdout);
          if (stderr) {
            console.log(stderr);
            res.end(`Warnings while installing packages (these are not usually fatal): ${stderr}`);
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
  startServer: (cb) => {
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

    fs.unlink(SOCKET_FILE, () => {
      server.listen(SOCKET_FILE);
      console.log('localApi server listening on', SOCKET_FILE);
      cb && cb();
    });
  },

  stopServer: () => {
    console.log('stopping localApi server');
    server.close();
  }
};
