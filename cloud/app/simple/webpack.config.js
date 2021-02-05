const path = require('path');

module.exports = {
  entry: './test.js',
  module: {
    rules: [{
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: ['babel-loader'],
      }, {
        test: /\.css$/i,
        // use: ["to-string-loader", "css-loader"],
        use: ["style-loader", "css-loader"],
        // use: [
        //   { loader: "to-string-loader" },
        //   { loader: "css-loader" },
        // ]
      }]
  },
  resolve: {
    extensions: ['*', '.js', '.jsx'],
  },
  output: {
    path: path.resolve(__dirname, '../dist'),
    filename: 'bundle_simple.js'
  },

  mode: 'development',
  watch: true
};
