import React, { useState, useEffect } from 'react';
import {  } from 'react-bootstrap';

import { Heartbeat, ensureProps } from './shared';

const _ = {
  map: require('lodash/map'),
};

import { useMqttSync, createWebComponent, decodeJWT, versionCompare,
toFlatObject, getLogger } from '@transitive-robotics/utils-web';

import { Code } from '../src/utils/Code';

const log = getLogger('robot-agent-fleet');
log.setLevel('debug');

/** Show one device */
const FleetDevice = ({data, device, device_url}) => {
  const agentData = data['@transitive-robotics']['_robot-agent'];
  const latestVersion = Object.keys(agentData).sort(versionCompare).at(-1);
  const {status, info} = agentData[latestVersion];

  return <div>
    {info?.os?.hostname} {status.heartbeat &&
      <Heartbeat heartbeat={status.heartbeat} />
    } <a href={`${device_url}/${device}`}>view</a>
  </div>
};

/** Component showing the fleet from the robot-agent perspective */
const Fleet = (props) => {

  if (!ensureProps(props, ['jwt', 'id', 'robot_token', 'host', 'device_url'])) {
    return <div>missing props</div>;
  }
  const {jwt, id, robot_token, host, device_url} = props;
  const ssl = props.ssl && JSON.parse(props.ssl);
  log.debug('Fleet', host, device_url);

  const {mqttSync, data, status, ready, StatusComponent} = useMqttSync({jwt, id,
    mqttUrl: `${ssl ? 'wss' : 'ws'}://mqtt.${host}`});
  const prefix = `/${id}/+/@transitive-robotics/_robot-agent/+`;

  if (mqttSync) {
    mqttSync.subscribe(`${prefix}/status`);
    mqttSync.subscribe(`${prefix}/info`);
  }

  log.debug('data', data);
  if (!ready || !data) return <StatusComponent />;

  const curlURL = `http${ssl ? 's' : ''}://install.${host}`;

  return <div>
    <h5>Devices</h5>
    {_.map(data[id], (deviceData, device) =>
      <FleetDevice key={device} data={deviceData} device={device} device_url={device_url} />)}

      <Code>
        curl -s "{curlURL}?<wbr/>id={id}&<wbr/>token={robot_token}" | bash
      </Code>
  </div>
};


createWebComponent(Fleet, 'robot-agent-fleet', []);
