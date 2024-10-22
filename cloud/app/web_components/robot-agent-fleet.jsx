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
import { Fold } from '../src/utils/Fold';
import { Delayed } from '../src/utils/Delayed';

const log = getLogger('robot-agent-fleet');
log.setLevel('debug');

const F = React.Fragment;

const styles = {
  version: {
    opacity: 0.5,
    fontSize: 'smaller',
  },
  cap: {
    marginRight: '1em'
  }
};

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
            <span style={styles.cap} title={scopeName} key={name}>{name}
              <span style={styles.version}> v{
                  Object.keys(_.pickBy(versions, running => running)).join(',')
                }
              </span>
            </span>
          ))
      }
    </div>

  </ListGroup.Item>;
};

const compareHeartbeat = (a, b) =>
  heartbeatLevel(a.status?.heartbeat) - heartbeatLevel(b.status?.heartbeat);

/** Component showing the fleet from the robot-agent perspective */
const Fleet = (props) => {

  if (!ensureProps(props, ['jwt', 'id', 'session', 'host', 'device_url'])) {
    return <div>missing props</div>;
  }
  const {jwt, id, host, device_url} = props;
  const ssl = props.ssl && JSON.parse(props.ssl);
  // log.debug('Fleet', host, device_url);
  const session = props.session && JSON.parse(props.session);

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
    }).sort((a, b) => a.info.os?.hostname?.localeCompare(b.info.os?.hostname))
      .sort(compareHeartbeat);

  const stale = mergedData
      .filter(({status}) => heartbeatLevel(status.heartbeat) == 2)
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

  const empty = (Object.keys(mergedData).length == 0);

  // TODO: split this into dev/prod and our domain vs. custom
  // in prod + custom we don't need to add avahi
  const localDev = !location.hostname.endsWith('transitiverobotics.com');
  const dockerCommand = ['docker run -it --rm --privileged',
      '-v $HOME/.tr_docker:/root/.transitive -v /run/udev:/run/udev',
      localDev && '-v /var/run/dbus:/var/run/dbus',
      localDev && '-v /var/run/avahi-daemon/socket:/var/run/avahi-daemon/socket',
      '--name tr-robot --hostname robot1 transitiverobotics/try',
      `${id} '${session.robot_token}'`,
      localDev && location.origin.replace('portal', 'install')
    ].filter(Boolean).join(' ');

  return <div>
    <h5>Devices</h5>

    <div>
      {counts[0]} online, {counts[1]} offline, {counts[2]} inactive {
        stale.length > 0 && <ConfirmedButton
          onClick={clear} variant='link' style={{verticalAlign: 'initial'}}
          question='Remove inactive devices?'
          explanation={explanation}>
          Remove inactive devices
        </ConfirmedButton>}
    </div>


    <ListGroup variant="flush">
      {!empty ? _.map(mergedData, ({status, info, id}) =>
          <FleetDevice key={id} status={status} info={info} device={id}
            device_url={device_url} />)
        :
        <ListGroup.Item>
          <i>No devices yet.</i>
        </ListGroup.Item>
      }
      <ListGroup.Item>
        <Delayed>
          <Fold title="Add devices" expanded={empty}>
            <F>
              Execute this command on your device to add it:
              <Code
                code={`curl -s "${curlURL}?id=${id}&token=${
                  encodeURIComponent(session.robot_token)}" | bash`}
                />
              For instructions on getting started or to pre-install the agent and
              capabilities in Docker, please see the <a
                href={`//${host}/docs/guides/installing_in_docker/`}>documentation</a>.

              If you just want to try it out quickly you can use our example
              Docker image: <Code language='bash' code={dockerCommand} />
            </F>
          </Fold>
        </Delayed>
      </ListGroup.Item>
    </ListGroup>
  </div>
};


createWebComponent(Fleet, 'robot-agent-fleet', []);
