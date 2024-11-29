const esbuild = require('esbuild');
const fs = require('fs');

const { getPackageVersionNamespace } = require('@transitive-sdk/utils');

// Read config.versionNamespace from package.json to determine which
// version namespace to use: major, minor, or patch (default).
const versionNS = getPackageVersionNamespace();

const entryPoints = fs.readdirSync('./web_components', {withFileTypes: true})
    .filter(item => !item.isDirectory())
    .filter(({name}) => name.search('test.js') == -1)
    .map(({name}) => `./web_components/${name}`);
entryPoints.push({in: './src/index.js', out: 'app'});

const isDevelopment = (process.env.npm_lifecycle_event == 'dev-build');

const config = {
  entryPoints,
  bundle: true,
  preserveSymlinks: true, // this allows us to use symlinks
  minify: !isDevelopment,
  sourcemap: isDevelopment,
  target: ['es2022'],
  outdir: 'dist',
  define: { TR_PKG_VERSION_NS: versionNS },
  loader: {
    '.js': 'jsx',
    '.svg': 'text',
    // '.wasm': 'file',
    // '.css': 'local-css',
  },
  plugins: [{
    name: 'rebuild-notify',
    setup(build) {
      build.onEnd(result => {
        console.log(new Date(),
          `build ended with ${result.errors.length} errors`);
      })
    },
  }],
};

const run = async () => {
  const ctx = await esbuild.context(config);
  if (isDevelopment) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    process.exit(0);
  }
};

run();