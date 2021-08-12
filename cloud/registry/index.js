const fs = require('fs');
const startServer = require('verdaccio').default;

const Mongo = require('@transitive-robotics/utils/mongo');

const startVerdaccio = (capabilitiesCollection) => {

  const storage = `${process.env.HOME}/.local/share/verdaccio/storage`;
  const onNew = (name, ...args) => {
    console.log('onNew!', name, ...args);
  };

  const onAdd = (name, ...args) => {
    console.log('onAdd!', name, ...args);
  };

  const onUpdatePackage = (name, ...args) => {
    console.log('onUpdatePackage!', name, ...args);
    const package = JSON.parse(
      fs.readFileSync(`${storage}/${name}/package.json`, {encoding: 'utf-8'}));
    capabilitiesCollection.updateOne(
      {_id: name}, {$set: {'device_package': package}}, {upsert: true});
  };

  // see example at:
  // https://git.cubetiqs.com/sombochea/verdaccio-ui/src/commit/6f8d891c424f6c0ccd415b4a548edcdcc55e0d39/tools/verdaccio.js
  startServer({
      storage,
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
