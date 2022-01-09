import React, { useState, useEffect } from 'react';
import { Badge, Col, Row, Button, ListGroup } from 'react-bootstrap';
const _ = {
  map: require('lodash/map'),
  some: require('lodash/some'),
};

import { useDataSync, useWebRTC, createWebComponent }
from '@transitive-robotics/utils-web';
import { decodeJWT, versionCompare } from '@transitive-robotics/utils/client';

const Device = ({jwt, id}) => {

  const {status, ready, StatusComponent, data, dataCache, publish} =
    useDataSync({jwt, id});
  const {device} = decodeJWT(jwt);

  const deviceData = data && data[id] && data[id][device] &&
    data[id][device]['_robot-agent'];
  if (!ready || !deviceData) return <StatusComponent />;

  const versions = Object.keys(deviceData);
  console.log({deviceData, versions});
  versions.sort(versionCompare);
  const latestVersionData = deviceData[versions[0]];
  console.log(latestVersionData);

  return <div>
    WIP: Running packages, desired packages
    <Row>
      <Col sm="6">
        <h6>Capabilities</h6>
        <ListGroup>
          {_.map(latestVersionData?.status?.runningPackages, (obj, name) => {
            if (_.some(obj, running => running)) {
              return <ListGroup.Item key={name}>
                {name}
                <Badge variant="success">running</Badge>
                <Button variant='link' onClick={() =>
                  console.log('TODO: uninstall')
                }>
                  uninstall
                </Button>
                <Button variant='link' onClick={() =>
                  console.log('TODO: restart')
                }>
                  restart
                </Button>
              </ListGroup.Item>;
            }
          })}
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
