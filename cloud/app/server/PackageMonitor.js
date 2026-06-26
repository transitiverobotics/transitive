const _ = require('lodash');
const Mongo = require('@transitive-sdk/mongo');
const { getLogger, tryJSONParse } = require('@transitive-sdk/utils');

const log = getLogger('PackageMonitor');
log.setLevel('debug');


/** Singleton class for watching available packages and sharing that list */
class PackageMonitor {

  collection = null; // the mongo collection
  packages = {}; // packages by name

  async init() {
    this.collection = Mongo.db.collection('packages');

    const projection = {
      versions: 0,
      images: 0,
      readme: 0
    };

    const list = await this.collection
        .find({transitiverobotics: {$ne: null}}, {projection}).toArray();
    this.packages = _.keyBy(list, '_id');

    this.collection.watch().on('change',
      async change => {
        const packageId = change.documentKey._id;
        log.debug('package changed:', packageId);
        this.packages[packageId] = await this.collection
            .findOne({_id: packageId}, {projection});
      });


    if (!tryJSONParse(process.env.TR_REGISTRY_IS_LOCAL)
      && process.env.TR_BILLING_USER
      && process.env.TR_BILLING_SECRET) {

      // Also watch available packages from Transitive Robotics's public repo
      this.fetchPublicRepo();
      setInterval(this.fetchPublicRepo.bind(this), 12 * 60 * 60 * 1000);
      // every 12h is sufficient for now, since this is only required for
      // seeing new packages on self-deployments
    }
  }

  /** fetch public TR repo packages */
  async fetchPublicRepo() {
    const selector = JSON.stringify({transitiverobotics: {$ne: null}});
    const publicResponse = await fetch(
      `https://registry.transitiverobotics.com/-/custom/all?q=${selector}`);
    const publicData = await publicResponse.json();
    log.debug('got public packages', publicData);
    publicData.forEach(pkg => {
      this.packages[pkg.name] = pkg;
    });
  }
};

module.exports = new PackageMonitor();
