
const fs = require('fs');
const net = require('net');
const mqtt = require('mqtt');

const { MqttSync, getLogger, topicToPath, pathToTopic, registerCatchAll, wait,
  storageRequestToSelector
} = require('@transitive-sdk/utils');

const clickhouse = require('@transitive-sdk/clickhouse');

const log = getLogger('index.js');
log.setLevel('debug');

registerCatchAll();


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
  mqttSync.subscribe('/$store/$store/+/+/#');

  // Would it be better not to use retained/mqttsync but just QoS:2
  // directly? (or an RPC) wouldn't pollute the data space; but would require service to be online when
  // requests are made.
  //
  // No: because we still need to retain/store the request in order to restart
  // the subscription next time we start. Instead we just filter such "meta-data"
  // in MqttSync unless explicitly requested.
  mqttSync.data.subscribePath('/$store/$store/+scope/+capName/#',
    async (ttl, topic, {scope, capName}) => {

      if (!scope || !capName) {
        log.warn('Refusing to register MQTT topic for storage without scope and capability name:',
          topic);
        return;
      }

      const dataSelector = storageRequestToSelector(topic);

      // register this topic to be stored in ClickHouse
      log.info(`Registering ${dataSelector} with TTL ${ttl}`);
      mqttSyncData.subscribe(dataSelector);
      clickhouse.registerMqttTopicForStorage(dataSelector, ttl);
    });

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

