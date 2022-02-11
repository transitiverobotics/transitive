/**
  Define /install routes, used when installing new robots.
*/

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const Mongo = require('@transitive-robotics/utils/mongo');
const { getLogger } = require('@transitive-robotics/utils/server');
const log = getLogger(module.id);
log.setLevel('debug');

const router = express.Router();

const environment = {
  TR_HOST: process.env.TR_HOST || `${os.hostname()}:8000`,
  PROTOCOL: process.env.TR_HOST ? 'https://' : 'http://'
};

/** replace all [VAR] occurances with the value of VAR in environment */
const replaceEnvironmentVariables = (text, extras = {}) => {
  const env = Object.assign(extras, environment);
  return text.replace(/\[(\w*)\]/g, (match, varname) => env[varname] || match);
};

router.get('/', (req, res) => {
  if (!req.query.id || !req.query.token) {
    res.status(400).end('missing id or token');
    return;
  }

  log.debug('install new robot:', req.query.id);
  const text = fs.readFileSync('assets/install.sh').toString();
  res.end(replaceEnvironmentVariables(text, req.query));
});

router.get('/files/:filename', (req, res) => {
  // prevent reading outside of the assets sub-folder
  const filename = req.params.filename;
  log.debug('/files', filename);
  const text = fs.readFileSync(`assets/${filename}`).toString();
  res.end(replaceEnvironmentVariables(text));
});

/** sign the provided CSR (after verifying validity) */
router.post('/csr', (req, res) => {
  log.debug('/csr');

  const TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'transitive-'));
  const outstream = fs.createWriteStream(`${TMPDIR}/client.csr`);
  outstream.on('finish', async () => {
    // file has written, verify params.query.token
    try {
      const stdout = execSync(['openssl req',
            `-in ${TMPDIR}/client.csr`,
            `-subject`,
            `-noout`,
          ].join(' ')).toString('ascii');

      // get user id alleged by the certificate signing request
      const match = stdout.match(/subject=CN = ([^:]*):.*/);
      if (!match) {
        res.status(400).end('invalid signing request');
        return;
      }
      const userid = match[1];
      log.debug({userid, token: req.query.token});

      // find the record for that user
      const accounts = Mongo.db.collection('accounts');
      const user = await accounts.findOne({_id: userid}, {projection: {robotToken: 1}});

      // verify secret robot token
      if (!user || user.robotToken != req.query.token) {
        res.status(401).end('invalid userid or token');
        return;
      }

    } catch (err) {
      log.warn('error parsing CSR:', {err});
      res.status(400).end('unable to parse signing request');
      return;
    }

    // sign the CSR
    execSync(['openssl x509 -req',
        `-in ${TMPDIR}/client.csr`,
        '-CA /etc/mosquitto/certs/ca.crt',
        '-CAkey /etc/mosquitto/certs/ca.key',
        '-CAcreateserial',
        `-out ${TMPDIR}/client.crt`,
        '-days 36500'
      ].join(' '));
    const instream = fs.createReadStream(`${TMPDIR}/client.crt`);
    instream.pipe(res);
  });

  req.pipe(outstream);
});


module.exports = router;
