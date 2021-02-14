const path = require('path');

module.exports = {
  entry: './src/react-web-comp.jsx',
  module: {
    rules: [{
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: ['babel-loader'],
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
      }]
  },
  resolve: {
    extensions: ['*', '.js', '.jsx'],
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js'
  },

  mode: 'development',
  watch: true
};