// From: https://stackoverflow.com/a/63906923/1087119

module.exports = function (context, options) {
  return {
    name: 'plugin-dynamic-routes',
    async contentLoaded({ content, actions }) {
      const { routes } = options;
      const { addRoute } = actions;
      routes.map(route => addRoute(route));
    }
  }
}
