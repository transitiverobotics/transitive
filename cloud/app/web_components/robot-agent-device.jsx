import React, { useState, useEffect } from 'react';

import { Badge, Col, Row, Button } from 'react-bootstrap';
import { useDataSync, useWebRTC, createWebComponent }
from '@transitive-robotics/utils-web';

const Device = (props) =>
  <div>
    WIP: Running packages, desired packages
  </div>;

createWebComponent(Device, 'robot-agent-device', []);
