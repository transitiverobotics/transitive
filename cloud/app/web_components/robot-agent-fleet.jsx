import React, { useState, useEffect } from 'react';
import {  } from 'react-bootstrap';

import { Heartbeat } from './shared';

const _ = {
  map: require('lodash/map'),
};

import { useMqttSync, createWebComponent } from '@transitive-robotics/utils-web';
import { decodeJWT, versionCompare, toFlatObject, getLogger }
from '@transitive-robotics/utils/client';

import { Code } from '../src/utils/Code';

const log = getLogger('robot-agent-fleet');

/** Show one device */
const FleetDevice = ({data, device, device_url}) => {
  const agentData = data['@transitive-robotics']['_robot-agent'];
  const version = Object.keys(agentData)[0];
  const {status, info} = agentData[version];

  return <div>
    {info?.os?.hostname} {status.heartbeat &&
      <Heartbeat heartbeat={status.heartbeat} />
    } <a href={`${device_url}/${device}`}>view</a>
  </div>
};

/** Component showing the fleet from the robot-agent perspective */
const Fleet = ({jwt, id, robot_token, cloud_host, device_url}) => {
  log.debug('Fleet', cloud_host, device_url);

  const {mqttSync, data, status, ready, StatusComponent} = useMqttSync({jwt, id,
    mqttUrl: `${TR_SECURE ? 'wss' : 'ws'}://mqtt.${TR_HOST}`}); // TODO: use prop
  const prefix = `/${id}/+/@transitive-robotics/_robot-agent/+`;

  if (mqttSync) {
    mqttSync.subscribe(`${prefix}/status`);
    mqttSync.subscribe(`${prefix}/info`);
  }

  log.debug('data', data);
  if (!ready || !data) return <StatusComponent />;

  const curlURL = `http://install.${TR_HOST}`;

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
