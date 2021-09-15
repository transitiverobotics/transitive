import React, { useState, useRef } from 'react';

import { Badge } from 'react-bootstrap';
import { decodeJWT } from '@transitive-robotics/utils/client';

import { useDataSync, useWebRTC } from './hooks.js';
import { Timer, createWebComponent } from './shared.jsx';

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

  const dataSync = useDataSync({ jwt: props.jwt, id: props.id });
  const {device} = decodeJWT(props.jwt);
  const [ connectionState, setConnectionState ] = useState();
  const video = useRef(null);

  useWebRTC({
    dataSync,
    source: props.source,
    id: props.id,
    device,
    onConnectionStateChange: (connectionState) => {
      setConnectionState(connectionState);
    },
    onTrack: (track) => {
      video.current.srcObject = new MediaStream([track]);
    },
    bitrate_KB: 50,
    capabilityName: 'webrtc-video'
  });

  if (!dataSync.ready) {
    return 'Establishing connection..';
  }

  return <div style={styles.wrapper}>
    <ConnectionState connectionState={connectionState} />
    <video ref={video} autoPlay muted style={styles.video}/>
  </div>
};


const Device = (props) => <Timer duration={30}
  setOnDisconnect={props.setOnDisconnect}>
  <Video {...props}/>
</Timer>;


createWebComponent(Device, 'webrtc-video', ['source']);
