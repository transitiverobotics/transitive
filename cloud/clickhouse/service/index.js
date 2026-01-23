
const fs = require('fs');
const net = require('net');
const mqtt = require('mqtt');
const waitPort = require('wait-port');

const { MqttSync, getLogger, topicToPath, pathToTopic, registerCatchAll, wait }
  = require('@transitive-sdk/utils');

const clickhouse = require('@transitive-sdk/clickhouse');

const log = getLogger('index.js');
log.setLevel('debug');

registerCatchAll();


/** start the service, i.e., subscribe to "request topic" and register topics
 * to store when requests are received. */
const init = async () => {

  // wait ClickHouse server to come up
  await waitPort({ port: 8123, interval: 200 }, 10000);
  await wait(200);
  log.info('ClickHouse seems to be up');

  clickhouse.init({ url: 'http://localhost:8123' });
  await clickhouse.enableHistory({dataCache: mqttSync.data});

  /** Subscribe to special topic that capabilities can use to request storage of
  * their (retained) MQTT data in ClickHouse. */
  mqttSync.subscribe('/$store/$store/+/+/#');
  mqttSync.data.subscribePath('/$store/$store/+scope/+capName/#',
    async (ttl, topic, {scope, capName}) => {

      if (!scope || !capName) {
        log.warn('Refusing to register MQTT topic for storage without scope and capability name:',
          topic);
        return;
      }

      const path = topicToPath(topic);
      // replace special token with wildcard for subscribing
      path.forEach((part, i) => part == '$store' && (path[i] = '+'));

      const dataTopic = pathToTopic(path);

      // register this topic to be stored in ClickHouse
      log.info(`Registering ${dataTopic} with TTL ${ttl}`);
      mqttSync.subscribe(dataTopic);
      clickhouse.registerMqttTopicForStorage(dataTopic, ttl);
    });

};


// --------------------------------------------------------------------------
// MQTT

const MQTT_URL = process.env.MQTT_URL || 'mqtts://mosquitto';
let mqttSync;

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
  mqttSync ||= new MqttSync({mqttClient});

  init();
});

