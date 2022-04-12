import React, { useState, useEffect } from 'react';
import { Badge, Col, Row, Button, ListGroup, DropdownButton, Dropdown, Form }
from 'react-bootstrap';

const _ = {
  map: require('lodash/map'),
  some: require('lodash/some'),
  forEach: require('lodash/forEach'),
};

import { useMqttSync, createWebComponent, decodeJWT, versionCompare,
mqttTopicMatch, toFlatObject, getLogger, mqttClearRetained }
from '@transitive-sdk/utils-web';

import { Heartbeat, ensureProps } from './shared';
import { ConfirmedButton } from '../src/utils/ConfirmedButton';

const log = getLogger('robot-agent-device');

const styles = {
  row: {
    marginBottom: '2em'
  }
};

/** merge runningPackages and desiredPackages data for display */
const getMergedPackageInfo = (robotAgentData) => {
  if (!robotAgentData || !robotAgentData.status) {
    return {};
  }

  log.debug(robotAgentData, toFlatObject(robotAgentData.status.runningPackages));

  const rtv = {};
  robotAgentData?.status?.runningPackages &&
    _.forEach(toFlatObject(robotAgentData.status.runningPackages), (running, name) => {
      if (running) {
        const [scope, pkgName, version] = name.slice(1).split('/');
        name = `${scope}/${pkgName}`;
        rtv[name] = rtv[name] || {};
        rtv[name].running = rtv[name].running || {};
        rtv[name].running[version] = 1;
      }
    });

  robotAgentData.desiredPackages &&
    _.forEach(toFlatObject(robotAgentData.desiredPackages), (version, name) => {
      name = name.slice(1); // remove initial slash
      rtv[name] = rtv[name] || {};
      rtv[name].desired = version;
    });

  return rtv;
};


/** parse lsb_release info, e.g.,
'LSB Version:\tcore-11.1.0ubuntu2-noarch:security-11.1.0ubuntu2-noarch\nDistributor ID:\tUbuntu\nDescription:\tUbuntu 20.04.3 LTS\nRelease:\t20.04\nCodename:\tfocal'
*/
const parseLsbRelease = (string) => {
  const lines = string.split('\n');
  const rtv = {};
  lines.forEach(line => {
    const [field, value] = line.split('\t');
    // drop colon of field name, then add to rtv
    rtv[field.slice(0, -1)] = value;
  });
  return rtv;
};

/** display info from OS */
const OSInfo = ({os}) => <div>
  <h3>Device: {os.hostname}</h3>
  <Form.Text>
    {os.dpkgArch}, {parseLsbRelease(os.lsb_release)?.Description}
  </Form.Text>
</div>;


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

  const [availablePackages, setAvailablePackages] = useState([]);
  useEffect(() => {
      if (host === undefined) return;
      const cloudHost = `${ssl ? 'https' : 'http'}://data.${host}`;
      fetch(`${cloudHost}/@transitive-robotics/_robot-agent/availablePackages`)
        .then(result => result.json())
        .then(json => setAvailablePackages(json));
    }, [ssl, host]);

  if (mqttSync) {
    mqttSync.subscribe(`${prefix}/+`); // TODO: narrow this
    log.debug('adding publish', `${prefix}/+/desiredPackages`);
    mqttSync.publish(`${prefix}/+/desiredPackages`, {atomic: true});
  }

  log.debug('data', data);
  const deviceData = data && data[id] && data[id][device] &&
    data[id][device]['@transitive-robotics']['_robot-agent'];

  if (!ready || !deviceData) return <StatusComponent />;

  const latestVersion = Object.keys(deviceData).sort(versionCompare).at(-1);
  const latestVersionData = deviceData[latestVersion];
  log.debug(latestVersionData);

  // Pubishing under which-ever _robot-agent version we get talked to. A quirk
  // of how robot-agent works, since its robot-package and cloud code don't (yet)
  // colocate in code...
  const versionPrefix = `${prefix}/${latestVersion}`;

  const packages = getMergedPackageInfo(latestVersionData);

  const desiredPackagesTopic = `${versionPrefix}/desiredPackages`;

  /** add the named package to this robot's desired packages */
  const install = (pkg) => {
    console.log(`installing ${pkg._id}`);
    mqttSync.data.update(`${desiredPackagesTopic}/${pkg._id}`, '*');
  };

  const uninstall = (pkgName) => {
    console.log(`uninstalling ${pkgName}`);
    mqttSync.data.update(`${desiredPackagesTopic}/${pkgName}`, null);
  };

  const restartAgent = () => {
    const topic = `${versionPrefix}/_restart`;
    console.log('sending restart command', topic);
    mqttSync.mqtt.publish(topic, '1');
  };

  const restartPackage = (name) => {
    console.log('sending command to restart package', name);
    mqttSync.mqtt.publish(`${versionPrefix}/_restartPackage/${name}`, '1');
  };

  /** remove the device from the dashboard (until it republishes status, if at
  all) */
  const clear = () => {
    mqttClearRetained(mqttSync.mqtt, [prefix],
      () => {
        console.log('device removed');
        // redirect to fleet page if given, or to homepage otherwise
        location.href = props.fleetURL || '/';
      });
  };

  console.log('packages', packages);

  const os = latestVersionData.info?.os;

  const explanation = `This will delete all meta-data for this device. If the
    agent is still running, the device will come back but will require a
    restart of the agent in order to get back all meta-data, such as the hostname.`;

  return <div>
    <div style={styles.row}>
      {os && <OSInfo os={os}/>}
      {latestVersionData.status?.heartbeat &&
        <Heartbeat heartbeat={latestVersionData.status.heartbeat} />}
    </div>

    <div style={styles.row}>
      <Button onClick={restartAgent} variant='outline-warning'>
        Restart agent
      </Button>
      <ConfirmedButton onClick={clear} variant='outline-secondary'
        explanation={explanation}>
        Remove device
      </ConfirmedButton>
    </div>

    <div style={styles.row}>
      <h5>Capabilities</h5>
      <ListGroup>
        { Object.keys(packages).length > 0 ?
          _.map(packages, ({running, desired}, name) => <ListGroup.Item key={name}>
            {name} {
              running && <Badge bg="success">
                running: {Object.keys(running).join(', ')}
              </Badge>
            } {
              running && <Button variant='link' href={`/device/${device}/${name}`}>
                view
              </Button>
            } {
              running && <Button variant='link'
                onClick={() => restartPackage(name)}>
                restart
              </Button>
            } {
              desired ? <Button variant='link' onClick={() => uninstall(name)}>
                uninstall
              </Button> :
              <span> (to be removed)</span>
            }
          </ListGroup.Item>) :

          <ListGroup.Item>No apps running.</ListGroup.Item>
        }

        <ListGroup.Item>
          <DropdownButton title="Install apps" variant='link'>
            {availablePackages.map(pkg => <Dropdown.Item
                key={pkg._id}
                onClick={() => install(pkg)}>
                {pkg.versions[0].transitiverobotics.title} ({pkg.version})
              </Dropdown.Item>)
            }
          </DropdownButton>
        </ListGroup.Item>
      </ListGroup>
    </div>
  </div>
};


createWebComponent(Device, 'robot-agent-device', []);
