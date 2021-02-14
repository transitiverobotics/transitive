const startServer = require('verdaccio').default;
require('verdaccio-fake2');

// see example at:
// https://git.cubetiqs.com/sombochea/verdaccio-ui/src/commit/6f8d891c424f6c0ccd415b4a548edcdcc55e0d39/tools/verdaccio.js
startServer({
    storage: '/tmp',
    // storage: '/home/cfritz/.local/share/verdaccio/storage',
    web: {
      enable: true
    },
    auth: {
      fake2: {}
    }
  }, 6000, '/tmp', '1.0.0', 'verdaccio',
   (webServer, addr, pkgName, pkgVersion) => {
       webServer.listen(addr.port || addr.path, addr.host, () => {
           console.log('verdaccio running');
       });
 });
