import React, { useState, useEffect } from 'react';
import { Badge, Col, Row, Button, ListGroup, DropdownButton, Dropdown }
from 'react-bootstrap';
const log = require('loglevel');
log.setLevel('debug');

const _ = {
  map: require('lodash/map'),
  some: require('lodash/some'),
};

import { useMqttSync, createWebComponent } from '@transitive-robotics/utils-web';
import { decodeJWT, versionCompare } from '@transitive-robotics/utils/client';

/** merge runningPackages and desiredPackages data for display */
const getMergedPackageInfo = (robotAgentData) => {
  if (!robotAgentData || !robotAgentData.status) {
    return {};
  }

  const rtv = {};
  _.forEach(robotAgentData.status.runningPackages, (obj, name) => {
    rtv[name] = rtv[name] || {};
    rtv[name].running = _.some(obj, running => running);
  });

  _.forEach(robotAgentData.desiredPackages, (version, name) => {
    rtv[name] = rtv[name] || {};
    rtv[name].desired = version;
  });

  return rtv;
};


const Device = ({jwt, id, cloud_host}) => {

  // const {status, ready, StatusComponent, data, dataCache, publish} =
  //   useDataSync({jwt, id});
  const {mqttSync, data, status, ready, StatusComponent} = useMqttSync({jwt, id,
    mqttUrl: `${TR_SECURE ? 'wss' : 'ws'}://mqtt.${TR_HOST}`});
  const {device} = decodeJWT(jwt);
  const prefix = `/${id}/${device}/_robot-agent`;

  const [availablePackages, setAvailablePackages] = useState([]);
  useEffect(() => {
      if (!cloud_host) return;
      fetch(`${cloud_host}/_robot-agent/availablePackages`)
        .then(result => result.json())
        .then(json => setAvailablePackages(json));
    }, [cloud_host]);

  // publish(`/${id}/${device}/_robot-agent/+/desiredPackages/#`);

  if (mqttSync) {
    mqttSync.subscribe(`${prefix}/+`); // TODO: narrow this
    log.debug('adding publish', `${prefix}/+/desiredPackages`);
    mqttSync.publish(`${prefix}/+/desiredPackages`, {atomic: true});
  }
  const deviceData = data && data[id] && data[id][device] &&
    data[id][device]['_robot-agent'];

  if (!ready || !deviceData) return <StatusComponent />;

  const versions = Object.keys(deviceData);
  versions.sort(versionCompare);
  const latestVersionData = deviceData[versions[0]];

  console.log(latestVersionData);

  // #HERE: not getting a reactive rerender when subscribed data (for
  // desiredPackages) changes

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

  console.log('packages', packages);

  return <div>
    <Row>
      <Col sm="6">
        <h6>Capabilities</h6>
        <ListGroup>
          { Object.keys(packages).length > 0 ?
            _.map(packages, ({running, desired}, name) => <ListGroup.Item key={name}>
              {name}
              {running && <Badge variant="success">running</Badge>}
              {running && <Button variant='link' onClick={() =>
                  console.log('TODO: restart')
                }>
                  restart
                </Button>
              }

              {desired ? <Button variant='link' onClick={() =>
                  console.log('TODO: uninstall')
                }>
                  uninstall
                </Button> :
                <span>(marked for removal)</span>
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
