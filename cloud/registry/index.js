const fs = require('fs');
const path = require('path');
const os = require('os');
const _ = require('lodash');
const tar = require('tar');
const mime = require('mime-types')
const assert = require('assert')
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const {URL} = require('url');

const { Readable } = require('stream');

const Mongo = require('@transitive-sdk/utils/mongo');
// const { versionCompare } = require('@transitive-robotics/utils/server');
// const { MQTTHandler } = require('@transitive-robotics/utils/cloud');
const {randomId} = require('@transitive-sdk/utils');

const PORT = 6000;

const TR_HOST = process.env.TR_HOST;
const TR_SECURE = JSON.parse(process.env.PRODUCTION || false);
const PROTOCOL = TR_SECURE ? 'https' : 'http';

const startServer = ({collections: {tarballs, packages, accounts}}) => {

  /** middleware to retrieve user's account, if any; implies requiring login */
  const useUser = async (req, res, next) => {
    if (!req.headers.authorization) {
      res.status(403).json({error: "You need to be logged in."});
      return;
    }
    const token = req.headers.authorization.match(/^Bearer (.*)$/)[1];

    // look up user from this token
    const account = await accounts.findOne({'tokens.token': token});
    if (!account) {
      res.status(403).json({error: "Invalid npm token. Please re-login."});
      return;
    }

    const {readonly} = account.tokens.find(tokenObj => tokenObj.token == token);
    req.user = {_id: account._id, readonly};
    next();
  };


  /** look through the provided tar data (base64) and extract images from docs
  folder */
  const addImagesFromTar = (tarData, pkgId) => {
    const stream = Readable.from(Buffer.from(tarData, 'base64'));
    // stream.pipe(new tar.Parse({
    // stream.pipe(tar.x({
    //   onentry: entry => {

    const images = [];
    /* on entry: check if image and add to images array if so */
    const onEntry = (entry) => {
      console.log('tar entry', entry.path);
      if (!entry.path.startsWith('package/docs/')) {
        return;
      }

      const fileType = mime.lookup(entry.path);
      if (!fileType || fileType.split('/')[0] != 'image') {
        return;
      }
      console.log(`found image in tar ${entry.path}, adding to db in base64`);

      const chunks = [];
      entry.on('data', chunk => chunks.push(chunk));
      entry.on('end', () => {

        const buf = Buffer.concat(chunks);
        if (buf.length > 16 * 1024 * 1024) {
          console.warn(`image ${entry.path} too large (${buf.length} bytes > 16MB), not adding`);
          return;
        }

        images.push({
          path: entry.path,
          mime: fileType,
          size: entry.size,
          base64: buf.toString('base64')
        });
      });

      while (entry.read());
    };

    stream.pipe(tar.x({cwd: '/tmp'}))
      .on('entry', onEntry)
      .on('end', () => packages.updateOne({_id: pkgId}, {$set: {images}}));
  };


  const app = express();
  app.use(express.json({limit: '10mb'}));

  /** --- Authentication ---------------------------------------------------- */

  app.post('/-/v1/login', (req, res) => {
    res.status(401).end();
  });

  /** login request, sample:
    {
        "_id": "org.couchdb.user:chfritz",
        "date": "2022-01-12T20:39:05.775Z",
        "name": "chfritz",
        "password": "THE_REAL_PASSWORD_IN_PLAIN_TEXT",
        "roles": [],
        "type": "user"
    }
    when successful need to respond with 201,
    {
        "id": "org.couchdb.user:undefined",
        "ok": true,
        "rev": "_we_dont_use_revs_any_more",
        "token": "npm_QVadVXXXXXXX_THE_ACTUAL_TOKEN_XXXXXXXXXXXXXXRq"
    }
  */
  app.put('/-/user/:userid', async (req, res) => {
    console.log('PUT', req.originalUrl, req.body);

    const fail = (error) => res.status(401).json({error, ok: false});

    // verify ID
    const account = await accounts.findOne({_id: req.body.name});
    if (!account) {
      return fail('invalid credentials');
      // on purpose not disclosing that the account doesn't exist
    }

    const valid = await bcrypt.compare(req.body.password, account.bcryptPassword);
    if (!valid) {
      return fail('invalid credentials');
    }

    const token = randomId(24);
    await accounts.updateOne({_id: req.body.name}, {$push: {tokens: {
      readonly: false,
      created: new Date(),
      token
    }}});

    res.status(201).json({
      id: req.body._id,
      ok: true,
      token
    });
  });

  /** --- Custom ---------------------------------------------------------- */

  /** Custom route for updating meta-data only without republishing. Expects a
   * JSON body `{pkg, readme}` where pkg is the package.json and readme is the
   * string content of the README.md file of the package.
  */
  app.post('/-/custom/packageMeta', useUser, async (req, res) => {
    const data = req.body;
    console.log(`updating metadata for package`, data.pkg.name);

    if (req.user.readonly) {
      res.status(401).json({
        error: `Your token does not grant permission to publish`,
        success: false
      });
      return;
    }

    const package = await packages.findOne({_id: data.pkg.name});
    if (!package) {
      res.status(400).json({
        error: `No such package ${data.pkg.name}`,
        success: false
      });
      return;
    }

    // verify user is owner
    if (package.owner != req.user._id) {
      res.status(401).json({
        error: `You are not the owner of this package`,
        success: false
      });
      return;
    }

    const result = await packages.updateOne({_id: data.pkg.name}, {$set: {
      readme: data.readme,
      transitiverobotics: data.pkg.transitiverobotics
    }});
    res.status(200).json(result);
  });


  /** --- Packages ---------------------------------------------------------- */

  app.put('/:package/:_rev?/:revision?', useUser, async (req, res) => {
    const data = req.body;
    if (req.params._rev) {
      res.status(401).json({
        error: `We don't support revisions.`,
        success: false
      });
      return;
    }
    console.log(`receiving package ${data.name}`);

    // ensure all tarball URLs use our global hostname, not localhost
    // TODO: still needed after transitive#376 ?
    _.each(data.versions, ({dist}) => {
      if (dist.tarball) {
        const {pathname} = new URL(dist.tarball);
        dist.tarball = `${PROTOCOL}://registry.${TR_HOST}${pathname}`;
      }
    });

    if (req.user.readonly) {
      res.status(401).json({
        error: `Your token does not grant permission to publish`,
        success: false
      });
      return;
    }

    const attachments = data._attachments;
    const versionNumber = _.keys(data.versions)[0];
    delete data._attachments;

    const package = await packages.findOne({_id: req.params.package});

    if (!package) {
      data.versions = Object.values(data.versions); // convert to array
      const versionObj = data.versions[0];
      Object.assign(data, {
        owner: req.user._id,
        version: versionObj.version,
        author: versionObj.author,
        keywords: versionObj.keywords,
        'dist-tags': data['dist-tags'],
        readme: versionObj.readme,
        description: data.description,
        date: new Date(),
        transitiverobotics: versionObj.transitiverobotics
      });

      packages.insertOne(data);

    } else {
      assert(versionNumber);

      // verify user is owner
      if (package.owner != req.user._id) {
        res.status(401).json({
          error: `You are not the owner of this package`,
          success: false
        });
        return;
      }

      if (package.versions.find(({version}) => version == versionNumber)) {
        // version already exists, refusing to overwrite
        res.status(403).json({
          error: `You cannot publish over the previously published versions: ${versionNumber}`,
          success: false
        });
        return;
      }

      // all tests passed: add new version
      const versionObj = data.versions[versionNumber];
      packages.updateOne({_id: req.params.package}, {$set: {
          version: versionObj.version,
          author: versionObj.author,
          keywords: versionObj.keywords,
          'dist-tags': data['dist-tags'],
          readme: versionObj.readme,
          description: data.description,
          date: new Date(),
          transitiverobotics: versionObj.transitiverobotics
        },
        $push: {
          versions: versionObj
        }});
    }

    _.each(attachments, ({data}, filePath) => {
      tarballs.insertOne({_id: filePath, data});
      console.log(`stored tarball ${filePath}`);
      addImagesFromTar(data, req.params.package);
    });

    res.status(200).end();

  });


  /** get package info
   * Test with, e.g., `npm v @transitive-robotics/terminal --json | fx`
  */
  app.get('/:package', cors(), async (req, res) => {
    console.log('GET', req.params, req.headers.authorization);
    const package = await packages.findOne({_id: req.params.package});
    if (!package) {
      res.status(404).end();
    } else {
      // Post-process

      // Change URL of dist.tarball to reflect the hostname that was used in
      // request (see transitive#376).
      package.versions.forEach(version => {
        if (version.dist?.tarball) {
          const {pathname} = new URL(version.dist.tarball);
          const protocol= req.headers['x-forwarded-proto'] || 'http';
          const host = req.headers['x-forwarded-host'] || req.headers.host;
          version.dist.tarball = `${protocol}://${host}${pathname}`;
        }
      });

      // npm expects versions to he an object with version numbers as keys
      package.versions = _.keyBy(package.versions, 'version');

      res.json(package);
    }
  });

  /** get package tarball */
  app.get('/:scope1/:packageName/-/:scope/:filename', async (req, res) => {
    console.log('get tarball', req.url, req.headers.authorization);
    const file = await tarballs.findOne({
      _id: `${req.params.scope}/${req.params.filename}`});
    if (file) {
      res.send(Buffer.from(file.data, 'base64'));
    } else {
      res.status(404).end('tarball does not exist');
    }
  });

  /** search for packages,
  e.g., /-/v1/search?text=%40transitive-robotics&size=20&from=0
  */
  app.use('/-/v1/search', async (req, res) => {
    console.log('search for', req.query.text);
    const total = await packages.count({name: {$regex: req.query.text}});
    const results = await packages.find({name: {$regex: req.query.text}}).toArray();
    console.log({results});
    res.json({
      total,
      time: new Date(),
      objects: results.map(pkg => ({
        package: pkg,
        score: {
          final: 1.0,
          detail: {
            quality: 1.0,
            popularity: 0.0,
            maintenance: 0.0
          }
        },
        searchScore: 1.0
      })),
    });
  });

  /** Not sure how `/-/all` was supposed to be used, npm doesn't use it anymore,
    but we need something like that, so creating our own on this path: list all
    packages, omitting `images` unless requested via `?images`. Can specify a
  selector in `q`, e.g., `'versions.transitiverobotics': {$exists: 1}`.
  */
  app.use('/-/custom/all', cors(), async (req, res) => {
    const projection = {
      versions: {$slice: -1} // get latest version of each package
    };
    !('images' in req.query) && (projection.images = 0);
    const selector = req.query.q ? JSON.parse(req.query.q) : {};

    const results = await packages.find(selector, {projection}).toArray();
    res.json(results);
  });

  /** --- Other ------------------------------------------------------------- */

  app.get('/', function (req, res) {
    res.send('This is a npm registry.');
  });

  /** catch-all for development */
  app.use('/*', function(req, res) {
    console.warn('Unknown path or not yet implemented: ',
      req.method, req.originalUrl, req.headers, req.body);
    res.status(404).end();
  });

  app.listen(PORT);
};

process.on('uncaughtException', (err) => {
  console.error(`**** Caught exception: ${err}:`, err.stack);
});


Mongo.init(() => {

  const tarballs = Mongo.db.collection('tarballs');
  const packages = Mongo.db.collection('packages');
  const accounts = Mongo.db.collection('accounts');
  accounts.createIndexes([{key: {'tokens.token': 1}}, {key: {'name': 1}}]);

  // If a bot token is provided as an env var, set it int he accounts db
  console.log(process.env.TR_BOT_TOKEN);
  process.env.TR_BOT_TOKEN && accounts.replaceOne({_id: 'bot'}, {
    tokens: [{
      readonly: false,
      created: new Date,
      token: process.env.TR_BOT_TOKEN
    }]
  }, {upsert: true});

  startServer({collections: {tarballs, packages, accounts}});
});
