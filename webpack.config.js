var path = require('path');

module.exports = {
  devTool: '#source-map',  
  entry: {
  	app: path.resolve(__dirname, 'src/client/scripts/entry.jsx')
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: '/'
  },
  module: {
    loaders: [
      { test: /\.jsx?$/, exclude: /node_modules/, loader: "babel-loader", query: { presets: ['es2015', 'react'] } },
      { test: /\.css$/, loader: 'style-loader!css-loader' },
      { test: /\.json$/, loader: 'json-loader' },
      { test: /jquery/, loader: 'expose?$!expose?jQuery' }
    ]
  },
  resolve: {
    extensions: ['', '.js', '.json', '.jsx'] 
  }
};