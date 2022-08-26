const path = require('path');
const os = require('os');
const webpack = require('webpack');
const fs = require('fs');
// const nodeExternals = require('webpack-node-externals');

if (!process.env.npm_package_version) {
  console.error('** Error: Must be run via npm, e.g., `npm run dev`.');
  process.exit(1);
}

// get all web components from directory, compile each one separately
const entry = {app: {
  import: `./src/index.js`,
  filename: 'app.js'
}};
fs.readdirSync('./web_components').forEach(name =>
  entry[name] = {
    import: `./web_components/${name}`,
    filename: name.replace(/jsx$/, 'js')
  });

module.exports = {
  entry, // see above
  // externals: [nodeExternals()],
  // resolve: {
  //   alias: {
  //     react: path.resolve('./node_modules/react')
  //   }
  // },
  module: {
    rules: [{
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        options: {
          presets: [
            '@babel/preset-env',
            '@babel/preset-react'
          ],
          plugins: [
            '@babel/plugin-proposal-class-properties'
          ]
        },
      }, {
        test: /\.css$/i,
        use: [
          // this doesn't work for some reason:
          // { loader: "react-web-component-style-loader" },
          //
          // this will insert the style into the app itself (not the shadowDom
          // of our component)
          // { loader: "style-loader" },
          //
          // This will insert the style into the react-web-component tag,
          // but not inside the shadowDom inside of that
          // {
          //   loader: 'style-loader',
          //   options: {
          //     // insert: 'head',
          //     insert: 'react-web-component',
          //   },
          // },
          // "extract-loader",
          { loader: "css-loader" },
        ]
      }, {
        test: /\.(png|jpe?g|gif|svg|eot|ttf|woff|woff2)$/i,
        loader: "url-loader",
        options: {
          limit: 8192,
        },
      }],
  },
  resolve: {
    extensions: ['*', '.js', '.jsx'],
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
  },
  plugins: [
    new webpack.DefinePlugin({
      'TR_HOST': JSON.stringify(process.env.TR_HOST || `${os.hostname()}:8000`),
      'TR_PKG_VERSION': JSON.stringify(process.env.npm_package_version),
      'TR_SECURE': JSON.stringify(process.env.SECURE || 'false'),
    })
  ],
  watch: true
};
