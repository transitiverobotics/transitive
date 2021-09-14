import React, { useState, useRef, useEffect } from 'react';

import { Badge, Col, Row, Button } from 'react-bootstrap';
import { decodeJWT } from '@transitive-robotics/utils/client';
// import { Joystick as ReactJoystick } from 'react-joystick-component';
import { Joystick as ReactJoystick } from './ReactJoystickComp';

import { useDataSync, useWebRTC } from './hooks.js';
import { Timer, createWebComponent } from './shared.jsx';

const styles = {
  wrapper: {
    display: 'flex',
    flexWrap: 'wrap',
  },
  videoWrapper: {
    position: 'relative',
    textAlign: 'center',
    flex: '1 1 320px',
  },
  status: {
    position: 'absolute',
    top: '4px',
    left: '4px',
    zIndex: 10,
    opacity: '60%'
  },
  video: {
    // width: '320px',
    // height: '240px'
    maxHeight: '100%',
    maxWidth: '100%',
    margin: 'auto'
  },
  joystick: {
    // width: '200px',
    // height: '200px',
    minHeight: '200px',
    maxHeight: '100%',
    maxWidth: '100%',
    // position: 'relative',
    // width: '640px',
    flex: '1 1 320px'
  }
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



const SIZE = 200;

let interval;
let linear = 0;
let angular = 0;

const Joystick = ({dataChannel}) => {

  const updatePos = ({type, x, y}) => {
    // react-joystick-component' coordinate system has x to the right, y to the top
    linear = y * 2 / SIZE;
    angular = -x * 2 / SIZE;
    /* Thresholding to make it easier to go straight or turn in place */
    (Math.abs(linear) > 0.5 && Math.abs(angular) < 0.1) && (angular = 0);
    (Math.abs(angular) > 0.5 && Math.abs(linear) < 0.1) && (linear = 0);
  };

  /* send current twist to robot */
  const send = () => {
    // We use just two bytes to send linear and angular speeds. These are
    // interpreted as floats again on the backend. See remote-teleop/main.js
    const buffer = Int8Array.from([linear * 127, angular * 127]);
    dataChannel.send(buffer);
  };

  const onEnd = () => {
    interval && clearInterval(interval);
    linear = 0;
    angular = 0;
    // send this immediately
    send();
  };

  const onStart = (event) => {
    // interval to send to back-end
    console.log(event);
    updatePos(event);
    send();
    interval && clearInterval(interval);
    interval = setInterval(send, 50);
  };

  /** send twist once */
  const sendOnce = (twist) => {
    linear = twist.linear || 0;
    angular = twist.angular || 0;
    send();
  };

  return <div>
    <Row className="justify-content-md-center">
      <Col md="4" style={{textAlign: 'center'}}>
        <Button variant="outline-secondary"
          onClick={() => sendOnce({linear: 1.0})}
        >Forward</Button>
      </Col>
    </Row>

    <Row className="justify-content-md-center">
      <Col md="2" style={{textAlign: 'center'}}>
        <Button variant="outline-secondary"
          onClick={() => sendOnce({angular: 1.0})}
        >Left</Button>
      </Col>

      <Col md="8" style={{textAlign: 'center'}}>
        <ReactJoystick
          size={SIZE}
          baseColor='linear-gradient(#bbb7, #8887)'
          stickColor='linear-gradient(#7779, #0009)'
          start={onStart}
          move={updatePos}
          stop={onEnd}
          style={{margin: 'auto'}}
          />
      </Col>

      <Col md="2" style={{textAlign: 'center'}}>
        <Button variant="outline-secondary"
          onClick={() => sendOnce({angular: -1.0})}
        >Right</Button>
      </Col>
    </Row>

    <Row className="justify-content-md-center">
      <Col md="4" style={{textAlign: 'center'}}>
        <Button variant="outline-secondary"
          onClick={() => sendOnce({linear: -1.0})}
        >Back</Button>
      </Col>
    </Row>
  </div>;
};


const TeleopVideo = (props) => {

  const dataSync = useDataSync({ jwt: props.jwt, id: props.id });
  const {device} = decodeJWT(props.jwt);
  const [ connectionState, setConnectionState ] = useState();
  const [ dataChannel, setDataChannel ] = useState();
  const [ videoReady, setVideoReady ] = useState(false);
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
      video.current.onplaying = (e) => {
        console.log('playing', e);
        setVideoReady(true);
      }
    },
    onDataChannel: (channel) => {
      console.log('teleop got a channel', channel.label);
      setDataChannel(channel);
    },
    onMessage: (channel, message) => {
      console.log('teleop got a message', message);
    },
    bitrate_KB: 50,
    capabilityName: 'remote-teleop'
  });


  if (!dataSync.ready) {
    return 'Establishing connection..';
  }

  return <div style={styles.wrapper} className='remote-teleop-wrapper'>
    <div style={styles.videoWrapper} className='remote-teleop-video'>
      <ConnectionState connectionState={connectionState} />
      <video ref={video} autoPlay muted style={styles.video}/>
    </div>
    <div style={styles.joystick} className='remote-teleop-joystick'>
      {dataChannel && videoReady && <Joystick dataChannel={dataChannel} />}
    </div>
  </div>
};


createWebComponent(TeleopVideo, 'remote-teleop', ['source']);
