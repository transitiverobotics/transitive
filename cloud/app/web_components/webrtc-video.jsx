import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactWebComponent from 'react-web-component';

import { Button, Badge } from 'react-bootstrap';

import { useDataSync, useWebRTC } from './hooks.js';
import { Timer } from './shared.jsx';

const styles = {
  wrapper: {position: 'relative'},
  status: {
    position: 'absolute',
    top: '4px',
    left: '4px',
    zIndex: 10,
    opacity: '60%'
  },
  video: {},
};

const decodeJWT = (jwt) => JSON.parse(atob(jwt.split('.')[1]));

const connIndicator = {
  connected: 'success',
  connecting: 'info',
  closed: 'warning',
  error: 'danger'
}

const ConnectionState = ({connectionState}) =>
  <Badge variant={connIndicator[connectionState] || 'secondary'}
    style={styles.status}>
    {connectionState}
  </Badge>;

const Video = (props) => {

  const sessionId = useMemo(() => Math.random().toString(36).slice(2), []);
  const { status, ready, StatusComponent, data, dataCache }
    = useDataSync({ jwt: props.jwt, id: props.id,
      publishPath: `+.+.+.${sessionId}.client` });
  const {device} = decodeJWT(props.jwt);
  const [ connectionState, setConnectionState ] = useState();
  const video = useRef(null);

  useWebRTC({
    sessionId,
    dataCache,
    ready,
    device,
    source: props.source,
    id: props.id,
    onConnectionStateChange: (connectionState) => {
      setConnectionState(connectionState);
    },
    onTrack: (track) => {
      video.current.srcObject = new MediaStream([track]);
    },
    bitrate_KB: 500,
    capabilityName: 'webrtc-video'
  });

  if (!ready) {
    return 'Establishing connection..';
  }

  return <div style={styles.wrapper}>
    <ConnectionState connectionState={connectionState} />
    <video ref={video} autoPlay muted style={styles.video}/>
  </div>
};


const Device = (props) => {

  const [running, setRunning] = useState(false);

  return <div>
    {running && <Video {...props}/>}
    <div>
      {<Timer duration={30}
          onTimeout={() => setRunning(false)}
          onStart={() => setRunning(true)}
          setOnDisconnect={props.setOnDisconnect}
          />
      }
    </div>
  </div>
};


class App extends React.Component {

  onDisconnect = null;

  state = JSON.parse(JSON.stringify(this.props));

  setOnDisconnect(fn) {
    this.onDisconnect = fn;
  }

  webComponentDisconnected() {
    console.log('closing webrtc connection');
    this.onDisconnect && this.onDisconnect();
  }

  /**
  Note that this currently requires
  "react-web-component": "github:amay0048/react-web-component#780950800e2962f45f0f029be618bb8b84610c89"
  TODO: create our own fork where this is done internally to react-web-component
  and props are updated.
  */
  webComponentAttributeChanged(name, oldValue, newValue) {
    // console.log('webComponentAttributeChanged', name, oldValue, newValue, this.props, this.state);
    const newState = this.state;
    newState[name] = newValue;
    this.setState(newState);
  }

  render() {
    // console.log('webrtc video device', this.state);
    return <div>
      <style>
        @import url("https://maxcdn.bootstrapcdn.com/bootstrap/4.5.0/css/bootstrap.min.css");
      </style>
      <Device {...this.state} setOnDisconnect={this.setOnDisconnect.bind(this)}/>
    </div>;
  }
};

ReactWebComponent.create(<App />, 'webrtc-video', false, ['source']);
