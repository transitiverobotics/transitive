const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const tar = require('tar');
const mime = require('mime-types')
const assert = require('assert')

const express = require('express');

const Mongo = require('@transitive-robotics/utils/mongo');
// const { versionCompare } = require('@transitive-robotics/utils/server');
// const { MQTTHandler } = require('@transitive-robotics/utils/cloud');

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

const startServer = ({collections: {tarballs, packages}}) => {

  const app = express();
  app.use(express.json());

  // fs.mkdirSync(STORAGE, {recursive: true});

  app.get('/', function (req, res) {
    console.log('saying hello');
    res.send('hello world');
  });


  app.put('/:package/:_rev?/:revision?', async (req, res) => {
    console.log(req.params, JSON.stringify(req.body, true, 2));
    const attachments = req.body._attachments;
    delete req.body._attachments;

    const package = await packages.findOne({_id: req.params.package});
    console.log({package});

    if (!package) {
      packages.insertOne(req.body);
    } else {
      const versionNumber = _.keys(req.body.versions)[0];
      assert(versionNumber);
      if (package.versions[versionNumber]) {
        // version already exists, refusing to overwrite
        res.status(403).end('version already exists'); // TODO: is this the right code?
        return;
      } else {
        // add new version
        packages.updateOne({_id: req.params.package},
          {$set: {versions: {
            [versionNumber]: req.body.versions[versionNumber]
          }}}
        );
      }
    }

    _.each(attachments, ({data}, filePath) => {
      // fs.mkdirSync(`${STORAGE}/${path.dirname(filePath)}`, {recursive: true});
      // const absoluteFilePath = `${STORAGE}/${filePath}`;
      // fs.writeFileSync(absoluteFilePath, Buffer.from(data, 'base64'));
      tarballs.insertOne({_id: filePath, data});
      console.log(`stored tarball ${filePath}`, data);
    });
    res.status(200).end();
  });


  app.get('/:package', async (req, res) => {
    console.log('GET', req.params);
    const package = await packages.findOne({_id: req.params.package});
    if (!package) {
      res.status(404).end();
    } else {
      res.json(package);
    }
  });

  /** get tarball */
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

  app.use('/*', function(req, res) {
    console.log('unknown path or not yet implemented',
      req.method, req.originalUrl, req.headers);
    res.status(404).end();
  });


  app.listen(PORT);
};



Mongo.init(() => {

  const tarballs = Mongo.db.collection('tarballs');
  const packages = Mongo.db.collection('packages');

  startServer({collections: {tarballs, packages}});
});
