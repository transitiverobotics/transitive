import React, { useState, useEffect } from 'react';
import { ListGroup, Badge, Form } from 'react-bootstrap';
import MultiRangeSlider from 'multi-range-slider-react';

import _ from 'lodash';

// const _ = {
//   map: require('lodash/map'),
//   pickBy: require('lodash/pickBy'),
//   reduce: require('lodash/reduce'),
// };

import { MapContainer, TileLayer, Marker, Tooltip, Popup } from 'react-leaflet';

import { useMqttSync, createWebComponent, decodeJWT, versionCompare,
  toFlatObject, getLogger, mergeVersions } from '@transitive-sdk/utils-web';

import { heartbeatLevel, Heartbeat, ensureProps } from './shared';
import { Code } from '../src/utils/Code';
import { Fold } from '../src/utils/Fold';
import { Delayed } from '../src/utils/Delayed';
import { ConfirmedButton } from '../src/utils/ConfirmedButton';

const log = getLogger('robot-agent-fleet');
log.setLevel('debug');

const F = React.Fragment;

const styles = {
  version: {
    opacity: 0.5,
    fontSize: 'smaller',
  },
  caps: {
    wordBreak: 'break-word',
    paddingLeft: '1em',
  },
  cap: {
    marginRight: '1em',
    whiteSpace: 'nowrap',
  },
  flex: {
    wrapper: {
      marginTop: '0.5em',
      display: 'flex',
    },
    label: {
      flex: '1 2 20em',
      margin: 'auto',
    },
    control: {
      flex: '20 1 10em',
      margin: 'auto',
    }
  },
  devices: {
    display: 'flex',
    flexWrap: 'wrap',
    flexDirection: 'row-reverse',
    gap: '2em',
  },
  map: {
    flex: '3 1 25em',
    minHeight: '20em',
    height: 'calc(80vh - 15em)',
    maxHeight: '50em'
  },
  list: {
    flex: '1 1 20em',
  }
};

const explanation = `This will remove the data for all inactive devices.
  They will reappear if they reconnect, but all capability data will be gone.`;

// array from 0 to 24
const hours = Array.from({ length: 25 }, (v, i) => i);

/** Show one device */
const FleetDevice = ({status, info, deviceId, device_url}) => {
  // log.debug({status, info, device, device_url});

  return <ListGroup.Item
    className="d-flex justify-content-between align-items-start"
    action href={`${device_url}/${deviceId}`}
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
      <div style={styles.caps}>
      { /* list running packages */
        _.map(status.runningPackages,
          (scope, scopeName) => _.map(scope, (versions, name) =>
            <span style={styles.cap}
              title={scopeName} key={name}>{name}
              <span style={styles.version}>&nbsp;v{
                  Object.keys(_.pickBy(versions, running => running)).join(',')
                }
              </span>
            </span>
          ))
      }
      </div>
    </div>

  </ListGroup.Item>;
};

const compareHeartbeat = (a, b) =>
  heartbeatLevel(a.status?.heartbeat) - heartbeatLevel(b.status?.heartbeat);

const attribution = [
    // '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a>',
    // '&copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a>',
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    'contributors'
  ].join(' ');
// const tilesUrl =
//   'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.{ext}';
const tilesUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"

/** map from heartbeat levels to icon leaflet marker classname */
const heartbeatIconClassNames = ['icon-green', 'icon-red', 'icon-grey'];

/** Get marker icon for heartbeat */
// const HeartbeatIcon = ({heartbeat}) => new L.Icon.Default({
const getHeartbeatIcon = (heartbeat) => new L.Icon.Default({
  className: heartbeatIconClassNames[heartbeatLevel(heartbeat)]
});


/** Component showing the fleet from the robot-agent perspective */
const Fleet = (props) => {

  if (!ensureProps(props, ['jwt', 'id', 'session', 'host', 'device_url'])) {
    return <div>missing props</div>;
  }
  const {jwt, id, host, device_url} = props;
  const ssl = props.ssl && JSON.parse(props.ssl);
  // log.debug('Fleet', host, device_url);
  const session = props.session && JSON.parse(props.session);
  const prefix = `/${id}/+/@transitive-robotics/_robot-agent/+`;
  // NOTE: make sure the cloud/app minor version is the same as the robot-agent.
  // This is done manually for now. #TODO: automate
  const fleetPrefix = `/${id}/_fleet/@transitive-robotics/_robot-agent`;
  const fleetPrefixVersion = `${fleetPrefix}/${TR_PKG_VERSION_NS}`;

  const {mqttSync, data, status, ready, StatusComponent} = useMqttSync({jwt, id,
    mqttUrl: `${ssl ? 'wss' : 'ws'}://mqtt.${host}`});

  useEffect(() => {
      if (mqttSync) {
        mqttSync.subscribe(`${prefix}/status`);
        mqttSync.subscribe(`${prefix}/info`);
        mqttSync.subscribe(`${fleetPrefix}/+/config`);
        mqttSync.publish(`${fleetPrefixVersion}/config`);
      }
    }, [mqttSync]);

  log.debug('data', data);
  if (!ready || !data) return <StatusComponent />;

  // merge all robot-agent versions' data and sort by hostname
  const mergedData = _.map(data[id], (device, deviceId) => {
      if (deviceId.startsWith('_')) return; // ignore _fleet
      const agentData = device['@transitive-robotics']['_robot-agent'];
      return {
        deviceId,
        status: mergeVersions(agentData, 'status').status,
        info: mergeVersions(agentData, 'info').info,
      }
    }).filter(Boolean)
      .sort((a, b) => a.info.os?.hostname?.localeCompare(b.info.os?.hostname))
      .sort(compareHeartbeat);

  const stale = mergedData
      .filter(({status}) => heartbeatLevel(status.heartbeat) == 2)
      .map((device) => `/${id}/${device.deviceId}`);

  /** remove inactive devices */
  const clear = () => {
    log.debug('clearing:', stale);
    // TODO: indicate progress/loading while waiting for callback, which depends
    // on getting a heartbeat from broker, which can take a while (~10 seconds)
    mqttSync.clear(stale, () => log.info('devices removed'));
  };

  const counts = _.reduce(mergedData, (agg, {status, info, deviceId}) => {
      const state = heartbeatLevel(status.heartbeat);
      agg[state]++;
      return agg;
    }, [0, 0, 0]);  // see heartbeat level in shared.jsx

  const empty = (Object.keys(mergedData).length == 0);

  // set the fleet config
  const setFleetConfig = (key, value) => {
    mqttSync.data.update(`${fleetPrefixVersion}/config/${key}`, value);
  };

  // Merge fleet data to get config
  const fleetData = mqttSync.data.getByTopic(fleetPrefix);
  const fleetConfig = fleetData && mergeVersions(fleetData, 'config').config;
  log.debug({fleetConfig, mergedData});

  /** Component showing instructions for adding devices */
  const AddDevices = () => {
    // TODO: split this into dev/prod and our domain vs. custom
    // in prod + custom we don't need to add avahi
    const localDev = !location.hostname.endsWith('transitiverobotics.com');
    const dockerCommand = ['docker run -it --rm --privileged',
        '-v $HOME/.tr_docker:/root/.transitive -v /run/udev:/run/udev',
        localDev && '-v /var/run/dbus:/var/run/dbus',
        localDev && '-v /var/run/avahi-daemon/socket:/var/run/avahi-daemon/socket',
        '--name tr-robot --hostname robot1 transitiverobotics/try_noetic',
        `${id} '${session.robot_token}'`,
        localDev && location.origin.replace('portal', 'install')
      ].filter(Boolean).join(' ');
    const curlURL = `http${ssl ? 's' : ''}://install.${host}`;

    return <Fold title="Add devices" expanded={empty}>
      <F>
        Execute this command on your device to add it:
        <Code
          code={`curl -s "${curlURL}?id=${id}&token=${
            encodeURIComponent(session.robot_token)}" | bash`}
          />
        For instructions on getting started or to pre-install the agent and
        capabilities in Docker, please see the <a
          href={`//${host}/docs/guides/installing_in_docker/`}>documentation</a>.

        If you just want to try it out quickly you can use one of our example
        Docker images: <Code language='bash' code={dockerCommand} />
        Besides <tt>try_noetic</tt> we also provide Docker images for
        ROS Humble and Jazzy (<tt>try_humble</tt> and <tt>try_jazzy
        </tt> respectively).
      </F>
    </Fold>;
  }

  // gather data for showing devices on map
  const devicesWithLocations = mergedData.filter(({status, info: {geo}}) =>
      geo?.latitude && geo?.longitude && heartbeatLevel(status.heartbeat) < 2);
  const bounds = L.bounds(Object.values(devicesWithLocations)
    .map(({info: {geo}}) => [geo.latitude, geo.longitude]));
  const locationGroups = _.groupBy(devicesWithLocations,
    ({info: {geo}}) => `${geo.latitude}-${geo.longitude}`);

  return <div>
    <style>{`
        .icon-green { filter: hue-rotate(240deg); }
        .icon-red { filter: hue-rotate(140deg); }
        .icon-grey { filter: saturate(0); }
        `}
    </style>
    <div >
      <h4>Devices</h4>

      <Fold
        title={<h6 style={{display: 'inline'}}>Fleetwide Configuration</h6>}
        expanded={false}>
        <div>

          <Form.Text>
            Configuration you set here applies to all your devices unless
            overwritten at the device level.
          </Form.Text>

          <div style={styles.flex.wrapper}>
            <div style={styles.flex.label}>
              Update window<br/>
              <Form.Text>
                Defines the daily hours between which devices may perform
                auto-updates (in device's timezone).
              </Form.Text>
            </div>
            <div style={styles.flex.control}>
              <MultiRangeSlider
                labels={hours}
                min={0}
                max={24}
                step={1}
                minValue={fleetConfig?.updateHours?.from || 0}
                maxValue={fleetConfig?.updateHours?.to ||24}
                onChange={({minValue, maxValue}) => {
                  setFleetConfig('updateHours', {from: minValue, to: maxValue});
                }}
                />
            </div>
          </div>
        </div>
      </Fold>

      <div>
        {counts[0]} online, {counts[1]} offline, {counts[2]} inactive {
          stale.length > 0 && <ConfirmedButton
            onClick={clear} variant='link' style={{verticalAlign: 'initial'}}
            question='Remove inactive devices?'
            explanation={explanation}>
            Remove inactive devices
          </ConfirmedButton>}
      </div>

      <div style={styles.devices}>

        {!empty && devicesWithLocations.length > 0 && <div style={styles.map}>
          <MapContainer style={{width: '100%', height: '100%'}}
            bounds={[[bounds.min.x, bounds.min.y], [bounds.max.x, bounds.max.y]]}
          >
            <TileLayer url={tilesUrl} attribution={attribution}
             	minZoom={0}	maxZoom={10} ext='png' />

            { _.map(locationGroups, (list, i) => {
              const {status, info, deviceId} = list[0];

              return <Marker key={i}
                eventHandlers={list.length == 1
                  ? {click: () => { location.href = `${device_url}/${deviceId}`}}
                  : {}}
                position={[info.geo.latitude, info.geo.longitude]}
                icon={getHeartbeatIcon(status.heartbeat)}
                >
                <Tooltip>{ list.length == 1
                    ? info.os?.hostname || deviceId
                    : list.map(({deviceId, info}) => info.os?.hostname || deviceId)
                      .join(', ')
                  }</Tooltip>
                { list.length > 1 && <Popup>
                  { list.map(({deviceId, info}, i) =>
                      <div key={i}>
                        <a href={`${device_url}/${deviceId}`}>
                          {info.os?.hostname || deviceId}
                        </a>
                      </div>)
                  }
                </Popup>}
              </Marker>;
            })}

          </MapContainer>
          <Form.Text style={{float: 'right'}}>
            Locations approximated based on geo IP
          </Form.Text>
        </div>}

        <ListGroup variant="flush" style={styles.list}>
          {!empty
            ? _.map(mergedData, ({status, info, deviceId}) =>
              <FleetDevice key={deviceId} {...{status, info, deviceId, device_url}} />)
            : <ListGroup.Item><i>No devices yet.</i></ListGroup.Item>
          }
        </ListGroup>
      </div>

      <hr/>

      <Delayed>
        <AddDevices />
      </Delayed>
    </div>
  </div>
};

createWebComponent(Fleet, 'robot-agent-fleet', '0.0',
  {stylesheets: ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.css']});
