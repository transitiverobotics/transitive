
const fs = require('fs');
const net = require('net');
const mqtt = require('mqtt');
const _ = require('lodash');

const { MqttSync, getLogger, topicToPath, pathToTopic, registerCatchAll, wait,
  metaPathToSelectorPath, selectorToMetaTopic
} = require('@transitive-sdk/utils');

const clickhouse = require('@transitive-sdk/clickhouse');

const log = getLogger('index.js');
log.setLevel('debug');

registerCatchAll();

/** return topic with slash in front if it doesn't have one yet */
const ensureSlash = (topic) => `${(topic[0] == '/' ? '' : '/')}${topic}`;

/** start the service, i.e., subscribe to "request topic" and register topics
 * to store when requests are received. */
const init = async (mqttSync) => {

  // A separate MqttSync instance, without meta-data, for data topics; using
  // the same mqtt client (and connection).
  const mqttSyncData = new MqttSync({ mqttClient: mqttSync.mqtt });

  await clickhouse.init({ url: 'http://localhost:8123' });
  await clickhouse.enableHistory({dataCache: mqttSyncData.data});

  /** Subscribe to special topic that capabilities can use to request storage of
  * their (retained) MQTT data in ClickHouse. */
  mqttSync.subscribe('/+/+/+/+/+/$store/#');

  // Would it be better not to use retained/mqttsync but just QoS:2
  // directly? (or an RPC) wouldn't pollute the data space; but would require service to be online when
  // requests are made.
  //
  // No: because we still need to retain/store the request in order to restart
  // the subscription next time we start. Instead we just filter such "meta-data"
  // in MqttSync unless explicitly requested.
  // mqttSync.data.subscribePath('/$store/$store/+scope/+capName/#',
  mqttSync.data.subscribePath('/+/+/+scope/+capName/+/$store/#',
    async (ttl, topic, {scope, capName}) => {

      if (!scope || !capName) {
        log.warn('Refusing to register MQTT topic for storage without scope and capability name:',
          topic);
        return;
      }

      const dataPath = topicToPath(topic);
      // remove the $store instruction:
      dataPath.splice(5,1);
      // interpret meta symbols
      const dataSelector = pathToTopic(metaPathToSelectorPath(dataPath));

      // register this topic to be stored in ClickHouse
      log.info(`Registering ${dataSelector} with TTL ${ttl}`);
      mqttSyncData.subscribe(dataSelector);
      clickhouse.registerMqttTopicForStorage(dataSelector, ttl);
    });

  // Register an RPC for responding to requests for historic data. This is used
  // by front-end clients to access data in ClickHouse. As such, it needs to be
  // flexible on and responsive to the topic it is called on (front-end clients
  // usually have only very narrow permissions from their JWT).
  mqttSync.register('/+/+/+/+/+/$queryMQTTHistory', async (params, topic) => {
    const {
      subtopic,
      since, // timestamp, not Date object
      until,
    } = params;

    // const dataSelector = storageRequestToSelector(topic);

    log.debug(`received queryMQTTHistory request for ${topic}: ${subtopic}`);

    // interpret _fleet as a wildcard, turn into path:
    const baseSelectorPath = metaPathToSelectorPath(
      topicToPath(topic)
        .slice(0,5)
        .map(x => x == '_fleet' ? '+' : x));

    const topicSelector =
      `${pathToTopic(baseSelectorPath)}${ensureSlash(subtopic)}`;
    log.debug({topicSelector});

    // construct query from params
    const query = { ...params, topicSelector};
    delete query.subtopic;
    query.since && (query.since = new Date(query.since));
    query.until && (query.until = new Date(query.until));

    // The main query call to ClickHouse:
    const results = await clickhouse.queryMQTTHistory(query);

    // Regroup (unflatten) into our usual structure, using array of values.
    const json = {};
    // Using trandition for loop, since there may be many rows
    for (let row of results) {
      let array = _.get(json, row.TopicParts);
      if (!array) {
        array = [];
        _.set(json, row.TopicParts, array);
      }
      array.push({Timestamp: row.Timestamp, Payload: row.Payload});
    }

    // log.debug(`Got ${results.length} results. ${JSON.stringify(results).length} B`);
    log.debug(`Got ${results.length} results. ${JSON.stringify(json).length} B`);
    return json;
  });

  // test: call ourselves
  // setTimeout(async () => {
  //     const result = await mqttSync.call(
  //       selectorToMetaTopic(
  //         '/cfritz/_fleet/@transitive-robotics/_robot-agent/+/$queryMQTTHistory'),
  //       {subtopic: '/status/heartbeat'});
  //     log.debug(result.length, result[0]);
  // }, 4000);
};


// --------------------------------------------------------------------------
// MQTT

const MQTT_URL = process.env.MQTT_URL || 'mqtts://mosquitto';

const mqttClient = mqtt.connect(MQTT_URL, {
  key: fs.readFileSync(`certs/client.key`),
  cert: fs.readFileSync(`certs/client.crt`),
  rejectUnauthorized: false,
  protocolVersion: 5 // needed for the `rap` option, i.e., to get retain flags
});

log.info('connecting');

mqttClient.on('connect', () => log.info('(re-)connected'));
mqttClient.on('error', log.error.bind(log));
mqttClient.on('disconnect', log.warn.bind(log));

mqttClient.once('connect', () => {
  log.info('connected');
  const mqttSync = new MqttSync({mqttClient, inclMeta: true});
  init(mqttSync);
});

