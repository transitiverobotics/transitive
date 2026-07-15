import React, { useEffect } from 'react';
import { Badge, Button } from 'react-bootstrap';

// const _ = {
//   map: require('lodash/map'),
//   some: require('lodash/some'),
//   forEach: require('lodash/forEach'),
// };

import { useMqttSync, createWebComponent, decodeJWT, mergeVersions, getLogger, versionCompare}
from '@transitive-sdk/utils-web';

import { Heartbeat, ensureProps, LogButtonWithCounter } from './shared';

const log = getLogger('robot-agent-device-header');
log.setLevel('debug');

const styles = {
  wrapper: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'end',
  },
  name: {
    fontWeight: 'bold',
    // flexGrow: 1,
    // fontSize: 'larger',
  },
  title: {
    marginTop: '0.5em',
  },
  extras: {
    display: 'inline-flex',
    marginLeft: '1em',
    alignItems: 'baseline',
    gap: '0.5em'
  }
};


/** Component showing the device from the robot-agent perspective */
const Device = (props) => {

  if (!ensureProps(props, ['jwt', 'id', 'host'])) {
    log.debug({props})
    return <div>missing props</div>;
  }
  const {jwt, id, host, title, pkg} = props;
  const ssl = props.ssl && JSON.parse(props.ssl);

  const {mqttSync, data, status, ready, StatusComponent } =
    useMqttSync({jwt, id, mqttUrl: `${ssl ? 'wss' : 'ws'}://mqtt.${host}`});
  const {device} = decodeJWT(jwt);
  const prefix = `/${id}/${device}/@transitive-robotics/_robot-agent`;
  const [scope, capName] = pkg.split('/');

  useEffect(() => {
      if (!mqttSync) return;
      mqttSync.subscribe(`${prefix}/+/status/heartbeat`);
      mqttSync.publish(`${prefix}/+/status/logs/errorCount/+`);
      mqttSync.subscribe(`${prefix}/+/info/#`);
    }, [mqttSync]);

  const ourData = data?.[id]?.[device]?.['@transitive-robotics']['_robot-agent'];
  const mergedData = mergeVersions(ourData);

  const latestVersion = ourData && Object.keys(ourData).sort(versionCompare).at(-1);
  const versionPrefix = `${prefix}/${latestVersion}`;

  return <div style={styles.wrapper}>
    <div style={styles.name}>
      <Heartbeat heartbeat={mergedData?.status?.heartbeat}/>
      <a href={`/device/${device}`}>
        {!ready ? '' : mergedData?.info?.os?.hostname || device}
      </a>
      <span style={styles.extras}>
        {mergedData?.info?.labels?.map(label =>
            <Badge bg="info">{label}</Badge>)
        }
      </span>
      <h3 style={styles.title}>{title}</h3>
    </div>
    <div style={styles.extras}>
      <LogButtonWithCounter
        text="log"
        mqttSync={mqttSync}
        versionPrefix={versionPrefix}
        packageName={pkg}
        // toolTipPlacement='bottom',
        errorCount={mergedData?.status?.logs?.errorCount?.[scope]?.[capName]}
        />
      <Button variant='link' href={`//${host}/caps/${pkg.replace('@','')}`}
        // style={styles.cap.docLink}
      >
        {/* <FaBook style={styles.icon}/>  */}
        documentation
      </Button>
    </div>
  </div>;
};


createWebComponent(Device, 'robot-agent-device-header', '0.0.0', { className: 'ignore' });
