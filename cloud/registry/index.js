const fs = require('fs');
const _ = require('lodash');
const tar = require('tar');
const mime = require('mime-types')

const startServer = require('verdaccio').default;

const Mongo = require('@transitive-robotics/utils/mongo');
const { versionCompare } = require('@transitive-robotics/utils/server');

const STORAGE = `${process.env.HOME}/.local/share/verdaccio/storage`;

/** find all images in the latest version of the package and add them as base64 */
const addPackageImages = (pkg, cb) => {
  if (!pkg.last_version) {
    cb();
    return;
  }

  console.log(pkg);
  const filename = _.findKey(pkg._attachments,
    a => a.version == pkg.last_version.version);
  if (!filename) {
    console.warn('unable to find tar ball for last version', pkg);
    cb();
    return;
  }

  pkg.images = [];

  tar.x({
    file: `${STORAGE}/${pkg.name}/${filename}`,
    cwd: '/tmp',
    onentry: entry => {
      const fileType = mime.lookup(entry.path);
      if (fileType && fileType.split('/')[0] == 'image') {
        console.log(`found image in tar ${entry.path}, adding to db in base64`);

        let data;
        const bufs = [];
        while (null !== (data = entry.read())) {
          bufs.push(data);
        }
        const buf = Buffer.concat(bufs);

        if (buf.length > 16 * 1024 * 1024) {
          console.warn(`image ${entry.path} too large (${buf.length} bytes > 16MB), not adding`);
          cb();
          return;
        }
        pkg.images.push({
          path: entry.path,
          mime: fileType,
          size: entry.size,
          base64: buf.toString('base64')
        });
      }
    }
  }, cb);
};


const startVerdaccio = (capabilitiesCollection) => {

  const onNew = (name, ...args) => {
    console.log('onNew!', name, ...args);
  };

  const onAdd = (name, ...args) => {
    console.log('onAdd!', name, ...args);
  };

  const onUpdatePackage = (name, ...args) => {
    console.log('onUpdatePackage!', name, ...args);
    const package = JSON.parse(
      fs.readFileSync(`${STORAGE}/${name}/package.json`, {encoding: 'utf-8'}));

    // find and set last version
    const latest =
      Object.keys(package.versions).sort(versionCompare).slice(-1)[0];
    package.last_version = package.versions[latest];
    addPackageImages(package, () => {
      capabilitiesCollection.updateOne(
        {_id: name}, {$set: {'device_package': package}}, {upsert: true});
    });
  };

  // see example at:
  // https://git.cubetiqs.com/sombochea/verdaccio-ui/src/commit/6f8d891c424f6c0ccd415b4a548edcdcc55e0d39/tools/verdaccio.js
  startServer({
      storage: STORAGE,
      store: {'evented-local-storage': { onAdd, onNew, onUpdatePackage }},
      web: { enable: true },
      auth: {
        fake2: {} // TODO: rename to http; it's not so fake anymore
      }
    }, 6000, '', '1.0.0', 'verdaccio',
    (webServer, addr, pkgName, pkgVersion) => {
      webServer.listen(addr.port || addr.path, addr.host, () => {
        console.log('verdaccio running');
      });
    });
};


Mongo.init(() => {
  startVerdaccio(Mongo.db.collection('capabilities'));
});
