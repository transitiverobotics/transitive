import React, { useState, useEffect } from 'react';
import { Badge, Col, Row, Button, ListGroup, DropdownButton, Dropdown }
from 'react-bootstrap';

const _ = {
  map: require('lodash/map'),
  some: require('lodash/some'),
  forEach: require('lodash/forEach'),
};

import { useMqttSync, createWebComponent } from '@transitive-robotics/utils-web';
import { decodeJWT, versionCompare, toFlatObject, log, getLogger }
from '@transitive-robotics/utils/client';
log.setLevel('debug');
window.log = log;

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


const Device = ({jwt, id, cloud_host}) => {

  const {mqttSync, data, status, ready, StatusComponent} = useMqttSync({jwt, id,
    mqttUrl: `${TR_SECURE ? 'wss' : 'ws'}://mqtt.${TR_HOST}`});
  const {device} = decodeJWT(jwt);
  const prefix = `/${id}/${device}/@transitive-robotics/_robot-agent`;

  const [availablePackages, setAvailablePackages] = useState([]);
  useEffect(() => {
      if (!cloud_host) return;
      fetch(`${cloud_host}/@transitive-robotics/_robot-agent/availablePackages`)
        .then(result => result.json())
        .then(json => setAvailablePackages(json));
    }, [cloud_host]);

  if (mqttSync) {
    mqttSync.subscribe(`${prefix}/+`); // TODO: narrow this
    log.debug('adding publish', `${prefix}/+/desiredPackages`);
    mqttSync.publish(`${prefix}/+/desiredPackages`, {atomic: true});
  }

  log.debug('data', data);
  const deviceData = data && data[id] && data[id][device] &&
    data[id][device]['@transitive-robotics']['_robot-agent'];

  if (!ready || !deviceData) return <StatusComponent />;

  const versions = Object.keys(deviceData);
  versions.sort(versionCompare);
  const latestVersionData = deviceData[versions[0]];
  console.log(latestVersionData);

  const packages = getMergedPackageInfo(latestVersionData);

  // Pubishing under which-ever _robot-agent version we get talked to. A quirk
  // of how robot-agent works, since its robot-package and cloud code don't (yet)
  // colocate in code...
  const desiredPackagesTopic = `${prefix}/${versions[0]}/desiredPackages`;

  /** add the named package to this robot's desired packages */
  const install = (pkg) => {
    console.log(`installing ${pkg._id}`);
    mqttSync.data.update(`${desiredPackagesTopic}/${pkg._id}`, '*');
  };

  const uninstall = (pkgName) => {
    console.log(`uninstalling ${pkgName}`);
    mqttSync.data.update(`${desiredPackagesTopic}/${pkgName}`, null);
  };

  console.log('packages', packages);

  return <div>
    <Row>
      <Col sm="6">
        <h6>Capabilities</h6>
        <ListGroup>
          { Object.keys(packages).length > 0 ?
            _.map(packages, ({running, desired}, name) => <ListGroup.Item key={name}>
              {name} {
                running && <Badge variant="success">
                  running: {Object.keys(running).join(', ')}
                </Badge>
              }
              {running && <Button variant='link' onClick={() =>
                  console.log('TODO: restart')
                }>
                  restart
                </Button>
              }

              {desired ? <Button variant='link' onClick={() => uninstall(name)}>
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
      </Col>

      <Col sm="6">
        <Button onClick={() => console.log('TODO: restart agent')}
          variant='outline-warning'>
          Restart agent
        </Button>
      </Col>
    </Row>
  </div>
};


createWebComponent(Device, 'robot-agent-device', []);
