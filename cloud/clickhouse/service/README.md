# MQTT2ClickHouse service

A simple service, listening for requests to store the history of specific MQTT topics in ClickHouse.


## Usage

From any authorized MQTT participant with write access to a capability namespace, i.e., cloud capabilities, publish this special topic to MQTT (retained) in order to have the specified capability sub-namespace be stored in ClickHouse. The value/payload must be a number denoting the desired TTL in days, i.e., days to store the topic values before auto-deleting them:
```
/$store/$store/SCOPE/CAP_NAME/$store/SUBTOPIC TTL_IN_DAYS
```

For example using `mqtt_tool` to request storing heartbeats for 21 days:
```
./index.js pub -r /\$store/\$store/@transitive-robotics/_robot-agent/\$store/status/heartbeat 21
```


## Query

To query the stored history, use `queryMQTTHistory` from `@transitive-sdk/clickhouse`.

For example, query the heartbeats of all robots of user `org123` from the last five days:
```js
const rows = await clickhouse.queryMQTTHistory({
  topicSelector: `/org123/+/@transitive-robotics/_robot-agent/+/status/heartbeats`,
  since: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
});
```
