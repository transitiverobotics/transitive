import React, { useState, useEffect, useContext } from 'react';
import ReactWebComponent from 'react-web-component';

import { ListGroup, Form } from 'react-bootstrap';

import { useDataSync } from './hooks.js';

const styles = {
};

const decodeJWT = (jwt) => JSON.parse(atob(jwt.split('.')[1]));

const Device = ({jwt, id}) => {
  const { status, ready, StatusComponent, data, dataCache } =
    useDataSync({ jwt, id, publishPath: '+.+.+.video_source'});
  const device = data && data[id] && (Object.values(data[id])[0])['video-streaming'];
  window.tr_devmode && console.log('video-streaming-config', data, device);

  const onDeviceToggle = (videoDevice, checked) => {
    console.log(videoDevice, checked, data, dataCache.get());
    const {device} = decodeJWT(jwt);
    dataCache.updateFromArray([id, device, 'video-streaming',
        'video_source', videoDevice, 'device'], checked ? videoDevice : null);
  };

  console.log(device);

  return (!ready ? <StatusComponent /> :
    ( !(device && device.video_devices)
      ? <div>Device has not yet published its video-devices.</div>
      : <div>
        Available video devices:
        <ListGroup>
          { device.video_devices && device.video_devices.map((dev, i) => {
              const active = !!(device.video_source &&
                device.video_source[dev] &&
                device.video_source[dev].device == dev)
              return <ListGroup.Item key={i}>
                <Form.Check
                  custom
                  type='checkbox'
                  id={`check-${dev}`}
                  label={dev}
                  checked={active}
                  onChange={e => onDeviceToggle(dev, !active)}
                  />
              </ListGroup.Item>;
            }
          )}
        </ListGroup>
      </div>
    )
  );
};

class App extends React.Component {
  render() {
    return <div>
      <style>
        @import url("https://maxcdn.bootstrapcdn.com/bootstrap/4.5.0/css/bootstrap.min.css");
      </style>
      <Device {...this.props}/>
    </div>;
  }
};

ReactWebComponent.create(<App />, 'video-streaming-config');
