import React, { useState, useEffect } from 'react';
import { ListGroup, Badge } from 'react-bootstrap';

import { heartbeatLevel, Heartbeat, ensureProps } from './shared';
import { ConfirmedButton } from '../src/utils/ConfirmedButton';

const _ = {
  map: require('lodash/map'),
  pickBy: require('lodash/pickBy'),
  reduce: require('lodash/reduce'),
};

import { useMqttSync, createWebComponent, decodeJWT, versionCompare,
toFlatObject, getLogger, mergeVersions } from '@transitive-sdk/utils-web';

import { Code } from '../src/utils/Code';

const log = getLogger('robot-agent-fleet');
log.setLevel('debug');

const clone = x => SON.parse(JSON.stringify(x));


const explanation = `This will remove the data for all inactive devices.
  They will reappear if they reconnect, but all capability data will be gone.`;

/** Show one device */
const FleetDevice = ({status, info, device, device_url}) => {
  // log.debug({status, info, device, device_url});

  return <ListGroup.Item
    className="d-flex justify-content-between align-items-start"
    action href={`${device_url}/${device}`}
  >
    <div className="ms-2 me-auto">
      <div className="fw-bold">
        {status.heartbeat && <Heartbeat heartbeat={status.heartbeat} />}
        <span>{info?.os?.hostname}</span>
        {info?.labels?.map(label =>
            <span key={label}>{' '}
              <Badge bg="info">{label}</Badge>
            </span>)
        }
      </div>
      { /* list running packages */
        _.map(status.runningPackages,
          (scope, scopeName) => _.map(scope, (versions, name) =>
            <span title={scopeName} key={name}>{name}: v{
                Object.keys(_.pickBy(versions, running => running)).join(',')
              } </span>
          ))
      }
    </div>

  </ListGroup.Item>;
};


/** Component showing the fleet from the robot-agent perspective */
const Fleet = (props) => {

  if (!ensureProps(props, ['jwt', 'id', 'robot_token', 'host', 'device_url'])) {
    return <div>missing props</div>;
  }
  const {jwt, id, robot_token, host, device_url} = props;
  const ssl = props.ssl && JSON.parse(props.ssl);
  // log.debug('Fleet', host, device_url);

  const {mqttSync, data, status, ready, StatusComponent} = useMqttSync({jwt, id,
    mqttUrl: `${ssl ? 'wss' : 'ws'}://mqtt.${host}`});
  const prefix = `/${id}/+/@transitive-robotics/_robot-agent/+`;

  // TODO: use useEffect
  if (mqttSync) {
    mqttSync.subscribe(`${prefix}/status`);
    mqttSync.subscribe(`${prefix}/info`);
  }

  log.debug('data', data);
  if (!ready || !data) return <StatusComponent />;

  const curlURL = `http${ssl ? 's' : ''}://install.${host}`;

  // merge all robot-agent versions' data and sort by hostname
  const mergedData = _.map(data[id], (device, deviceId) => {
    const agentData = device['@transitive-robotics']['_robot-agent'];
    return {
      id: deviceId,
      status: mergeVersions(agentData, 'status').status,
      info: mergeVersions(agentData, 'info').info,
    }
  }).sort((a, b) => a.info.os?.hostname?.localeCompare(b.info.os?.hostname));

  const stale = mergedData
      .filter(({status}) => heartbeatLevel(status.heartbeat) == 0)
      .map((device) => `/${id}/${device.id}`);

  /** remove inactive devices */
  const clear = () => {
    log.debug('clearing:', stale);
    // TODO: indicate progress/loading while waiting for callback, which depends
    // on getting a heartbeat from broker, which can take a while (~10 seconds)
    mqttSync.clear(stale, () => log.info('devices removed'));
  };

  const counts = _.reduce(mergedData, (agg, {status, info, id}) => {
      const state = heartbeatLevel(status.heartbeat);
      agg[state]++;
      return agg;
    }, [0, 0, 0]);  // see heartbeat level in shared.jsx

  return <div>
    <h5>Devices</h5>

    <div>
      {counts[0]} online, {counts[1]} offline, {counts[2]} inactive
      {stale.length > 0 && <ConfirmedButton onClick={clear} variant='link'
        explanation={explanation} style={{verticalAlign: 'initial'}}>
        Remove inactive devices
      </ConfirmedButton>}
    </div>


    <ListGroup variant="flush">
      {_.map(mergedData, ({status, info, id}) =>
          <FleetDevice key={id} status={status} info={info} device={id}
            device_url={device_url} />)
      }
      <ListGroup.Item>
        Add another device by executing this on your device:
        <Code>
          curl -s "{curlURL}?<wbr/>id={id}&<wbr/>token={encodeURIComponent(robot_token)}" | bash
        </Code>
        To pre-install the agent plus capabilities in a docker image, see the
        documentation.
      </ListGroup.Item>
    </ListGroup>
  </div>
};


createWebComponent(Fleet, 'robot-agent-fleet', []);
