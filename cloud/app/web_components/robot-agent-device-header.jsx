import React, { useState, useEffect } from 'react';
import {  }
from 'react-bootstrap';

// const _ = {
//   map: require('lodash/map'),
//   some: require('lodash/some'),
//   forEach: require('lodash/forEach'),
// };

import { useMqttSync, createWebComponent, decodeJWT, mergeVersions, getLogger }
from '@transitive-sdk/utils-web';

import { Heartbeat, ensureProps } from './shared';

const log = getLogger('robot-agent-device-header');

const styles = {
  name: {
    fontWeight: 'bold'
  }
};


/** Component showing the device from the robot-agent perspective */
const Device = (props) => {

  if (!ensureProps(props, ['jwt', 'id', 'host'])) {
    console.log({props})
    return <div>missing props</div>;
  }
  const {jwt, id, host} = props;
  const ssl = props.ssl && JSON.parse(props.ssl);

  const {mqttSync, data, status, ready, StatusComponent} = useMqttSync({jwt, id,
    mqttUrl: `${ssl ? 'wss' : 'ws'}://mqtt.${host}`});
  const {device} = decodeJWT(jwt);
  const prefix = `/${id}/${device}/@transitive-robotics/_robot-agent`;

  useEffect(() => {
    mqttSync?.subscribe(`${prefix}/+/#`);
  }, [mqttSync]);

  const mergedData = mergeVersions(
    data?.[id]?.[device]?.['@transitive-robotics']['_robot-agent']);

  return <div>
    <span style={styles.name}>
      {!ready ? '' : mergedData?.info?.os?.hostname || device}
    </span> <Heartbeat heartbeat={mergedData?.status?.heartbeat}/>
  </div>;
};


createWebComponent(Device, 'robot-agent-device-header', []);
