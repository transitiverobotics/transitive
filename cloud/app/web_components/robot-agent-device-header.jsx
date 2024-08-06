import React, { useState, useEffect } from 'react';
import { Badge, Button } from 'react-bootstrap';

// const _ = {
//   map: require('lodash/map'),
//   some: require('lodash/some'),
//   forEach: require('lodash/forEach'),
// };

import { useMqttSync, createWebComponent, decodeJWT, mergeVersions, getLogger }
from '@transitive-sdk/utils-web';

import { Heartbeat, ensureProps, PkgLog } from './shared';

const log = getLogger('robot-agent-device-header');
log.setLevel('debug');

const styles = {
  name: {
    fontWeight: 'bold'
  },
  wrapper: {
    padding: '0.25em'
  },
  buttons: {
    float: 'right',
  },
  button: {
    marginLeft: '1em',
  }
};


/** Component showing the device from the robot-agent perspective */
const Device = (props) => {

  const [pkgLog, setPkgLog] = useState();

  if (!ensureProps(props, ['jwt', 'id', 'host'])) {
    log.debug({props})
    return <div>missing props</div>;
  }
  const {jwt, id, host} = props;
  const ssl = props.ssl && JSON.parse(props.ssl);

  const {mqttSync, data, status, ready, StatusComponent } =
    useMqttSync({jwt, id, mqttUrl: `${ssl ? 'wss' : 'ws'}://mqtt.${host}`});
  const {device} = decodeJWT(jwt);
  const prefix = `/${id}/${device}/@transitive-robotics/_robot-agent`;
  const pkg = props.pkg; // name of the capability of whose page we are on
  const [scope, capName] = pkg.split('/');

  useEffect(() => {
    mqttSync?.subscribe(`${prefix}/+/#`);
  }, [mqttSync]);

  const ourData = data?.[id]?.[device]?.['@transitive-robotics']['_robot-agent'];
  const mergedData = mergeVersions(ourData);
  const version = ourData && Object.keys(ourData)[0];
  const runPkgCommand = (command, cb = log.debug) => {
    log.debug('running package command', command);
    mqttSync.call(`${prefix}/${version}/rpc/${command}`, {pkg}, cb);
  };

  return <div style={styles.wrapper}>
    <Heartbeat heartbeat={mergedData?.status?.heartbeat}/>
    <a href={`/device/${device}`} style={styles.name}>
      {!ready ? '' : mergedData?.info?.os?.hostname || device}
    </a>
    {mergedData?.info?.labels?.map(label =>
        <span key={label}>{' '}<Badge bg="info">{label}</Badge></span>)
    }
    <span style={styles.buttons}>
      <a href='#' style={styles.button}
        onClick={() => runPkgCommand('getPkgLog', (response) => {
          setPkgLog({[scope]: {[capName]: response}});
        })}>
        show capability log
      </a>
    </span>

    {pkgLog && <PkgLog response={pkgLog} hide={() => setPkgLog()}/>}
  </div>;
};


createWebComponent(Device, 'robot-agent-device-header');
