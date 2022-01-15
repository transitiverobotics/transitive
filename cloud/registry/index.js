const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const tar = require('tar');
const mime = require('mime-types')
const assert = require('assert')
const express = require('express');
const bcrypt = require('bcrypt');

const Mongo = require('@transitive-robotics/utils/mongo');
// const { versionCompare } = require('@transitive-robotics/utils/server');
// const { MQTTHandler } = require('@transitive-robotics/utils/cloud');
const {randomId} = require('@transitive-robotics/utils/server');

const PORT = 6000;
const STORAGE = `${process.env.HOME}/.local/share/transitive-registry/storage`;

/** find all images in the latest version of the package and add them as base64 */
// const addPackageImages = (pkg, cb) => {
//   if (!pkg.last_version) {
//     cb();
//     return;
//   }
//
//   console.log(pkg);
//   const filename = _.findKey(pkg._attachments,
//     a => a.version == pkg.last_version.version);
//   if (!filename) {
//     console.warn('unable to find tar ball for last version', pkg);
//     cb();
//     return;
//   }
//
//   pkg.images = [];
//
//   tar.x({
//     file: `${STORAGE}/${pkg.name}/${filename}`,
//     cwd: '/tmp',
//     onentry: entry => {
//       const fileType = mime.lookup(entry.path);
//       if (fileType && fileType.split('/')[0] == 'image') {
//         console.log(`found image in tar ${entry.path}, adding to db in base64`);
//
//         let data;
//         const bufs = [];
//         while (null !== (data = entry.read())) {
//           bufs.push(data);
//         }
//         const buf = Buffer.concat(bufs);
//
//         if (buf.length > 16 * 1024 * 1024) {
//           console.warn(`image ${entry.path} too large (${buf.length} bytes > 16MB), not adding`);
//           cb();
//           return;
//         }
//         pkg.images.push({
//           path: entry.path,
//           mime: fileType,
//           size: entry.size,
//           base64: buf.toString('base64')
//         });
//       }
//     }
//   }, cb);
// };


// const startVerdaccio = (mqttHandler) => {
//
//   const onNew = (name, ...args) => {
//     console.log('onNew!', name, ...args);
//   };
//
//   const onAdd = (name, ...args) => {
//     console.log('onAdd!', name, ...args);
//   };
//
//   const onUpdatePackage = (name, ...args) => {
//     console.log('onUpdatePackage!', name, ...args);
//     const package = JSON.parse(
//       fs.readFileSync(`${STORAGE}/${name}/package.json`, {encoding: 'utf-8'}));
//
//     // find and set last version
//     const latest =
//       Object.keys(package.versions).sort(versionCompare).slice(-1)[0];
//     package.last_version = package.versions[latest];
//     addPackageImages(package, () => {
//       capabilitiesCollection.updateOne(
//       {_id: name}, {$set: {'device_package': package}}, {upsert: true});
//       // mqttHandler.publish(//)  // #HERE
//     });
//   };
//
//   // see example at:
//   // https://git.cubetiqs.com/sombochea/verdaccio-ui/src/commit/6f8d891c424f6c0ccd415b4a548edcdcc55e0d39/tools/verdaccio.js
//   startServer({
//       storage: STORAGE,
//       store: {
//         'evented-local-storage': { onAdd, onNew, onUpdatePackage, config_path: STORAGE },
//       },
//       web: { enable: true },
//       auth: {
//         fake2: {} // TODO: rename to http; it's not so fake anymore
//       }
//     }, 6000, '', '1.0.0', 'verdaccio',
//     (webServer, addr, pkgName, pkgVersion) => {
//       webServer.listen(addr.port || addr.path, addr.host, () => {
//         console.log('verdaccio running');
//       });
//     });
// };


const startServer = ({collections: {tarballs, packages, accounts}}) => {

  const app = express();
  app.use(express.json());


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
    })
  });

  /** --- Packages ---------------------------------------------------------- */

  app.put('/:package/:_rev?/:revision?', useUser, async (req, res) => {
    const data = req.body;
    console.log(req.params, JSON.stringify(data, true, 2), req.headers);

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
    console.log({package});

    if (!package) {
      // TODO: add user as owner
      data.date = new Date();
      data.versions = Object.values(data.versions); // convert to array
      data.owner = req.user._id;
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

      // all test passed: add new version
      const versionObj = data.versions[versionNumber];
      packages.updateOne({_id: req.params.package}, {$set: {
          version: versionObj.version,
          author: versionObj.author,
          keywords: versionObj.keywords,
          'dist-tags': data['dist-tags'],
          readme: data.readme,
          description: data.description,
          date: new Date(),
        },
        $push: {
          versions: versionObj
        }});
    }

    _.each(attachments, ({data}, filePath) => {
      tarballs.insertOne({_id: filePath, data});
      console.log(`stored tarball ${filePath}`, data);
    });

    res.status(200).end();

  });


  /** get package info */
  app.get('/:package', async (req, res) => {
    console.log('GET', req.params);
    const package = await packages.findOne({_id: req.params.package});
    if (!package) {
      res.status(404).end();
    } else {
      package.versions = _.keyBy(package.versions, 'version');
      res.json(package);
    }
  });

  /** get package tarball */
  app.get('/:scope1/:packageName/-/:scope/:filename', async (req, res) => {
    console.log('get tarball', req.url);
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



Mongo.init(() => {

  const tarballs = Mongo.db.collection('tarballs');
  const packages = Mongo.db.collection('packages');
  const accounts = Mongo.db.collection('accounts');
  accounts.createIndexes([{key: {'tokens.token': 1}}, {key: {'name': 1}}]);

  startServer({collections: {tarballs, packages, accounts}});
});
