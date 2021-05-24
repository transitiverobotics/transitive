import React, { useState, useEffect, useContext } from 'react';
import ReactWebComponent from 'react-web-component';

import { ListGroup, Form } from 'react-bootstrap';

import { useDataSync } from './hooks.js';

const styles = {
};

const Device = ({jwt, id}) => {
  const { status, ready, StatusComponent, data, writeCache } = useDataSync({ jwt, id });
  const device = data && data[id] && (Object.values(data[id])[0])['video-streaming'];
  window.tr_devmode && console.log('video-streaming-config', data, device);

  const onDeviceToggle = (device, checked) => {
    console.log(device, checked);
    writeCache.updateFromArray(['video_source', device, 'device'],
      checked ? device : null);
  };

  return (!ready ? <StatusComponent /> :
    ( !(device && device.video_devices)
      ? <div>Device has not yet published its video-devices.</div>
      : <div>
        Available video devices:
        <ListGroup>
          { device.video_devices && device.video_devices.map((dev, i) =>
            <ListGroup.Item key={i}>
              <Form.Check
                custom
                type='checkbox'
                id={`check-${dev}`}
                label={dev}
                onChange={e => onDeviceToggle(dev, e.target.checked)}
                />
            </ListGroup.Item>
          )}
        </ListGroup>
      </div>
    )
  );
};

class App extends React.Component {
  render() {
    return <div>
      <Device {...this.props}/>
    </div>;
  }
};

ReactWebComponent.create(<App />, 'video-streaming-config');
