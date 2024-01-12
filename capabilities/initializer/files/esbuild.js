const esbuild = require('esbuild');
const fs = require('fs');
const { execSync } = require('child_process');
// const svgrPlugin = require('esbuild-plugin-svgr');
const { getPackageVersionNamespace } = require('@transitive-sdk/utils');

if (!process.env.npm_package_version || !process.env.npm_package_name) {
  console.error('This build script must be run from npm.');
  process.exit(1);
}

const entryPoints = fs.readdirSync('./web', {withFileTypes: true})
    .filter(item => !item.isDirectory())
    .filter(({name}) => name.search('test.js') == -1)
    .map(({name}) => `./web/${name}`);

const isDevelopment = (process.env.npm_lifecycle_event == 'dev-build');

const config = {
  entryPoints,
  bundle: true,
  preserveSymlinks: true, // this allows us to use symlinks to ../shared
  minify: !isDevelopment,
  sourcemap: isDevelopment,
  target: ['es2022'],
  outdir: 'dist',
  define: {
    TR_PKG_VERSION: JSON.stringify(process.env.npm_package_version),
    TR_PKG_NAME: JSON.stringify(process.env.npm_package_name),
    TR_PKG_VERSION_NS: JSON.stringify(getPackageVersionNamespace()),
  },
  // plugins: [
  //   svgrPlugin(),
  // ],
  loader: {
    '.svg': 'text',
    '.wasm': 'file',
    // '.css': 'local-css',
  },
  plugins: [{
    name: 'rebuild-notify',
    setup(build) {
      build.onEnd(result => {
        console.log(new Date(),
          `build ended with ${result.errors.length} errors`);

        const dir = `/tmp/caps/${process.env.npm_package_name}`;
        isDevelopment && execSync(`mkdir -p ${dir} && cp -r package.json dist ${dir}`);
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