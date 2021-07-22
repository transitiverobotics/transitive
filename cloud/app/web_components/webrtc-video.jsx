import React, { useState, useEffect, useRef } from 'react';
import ReactWebComponent from 'react-web-component';

import { Button } from 'react-bootstrap';

import { useDataSync } from './hooks.js';
import { Timer } from './shared.jsx';

const styles = {
};

const decodeJWT = (jwt) => JSON.parse(atob(jwt.split('.')[1]));

let connection;

const sessionId = Math.random().toString(36).slice(2);

const Device = (props) => {

  const { status, ready, StatusComponent, data, dataCache }
    = useDataSync({ jwt: props.jwt, id: props.id,
      publishPath: `+.+.+.${sessionId}.client` });
  const {device} = decodeJWT(props.jwt);
  let connected = false;
  const video = useRef(null);

  const startVideo = () => {
    // request an audience (webrtc connection) with the device
    dataCache.updateFromArray(
      [props.id, device, 'webrtc-video', sessionId, 'client', 'request'], new Date()
    );

    dataCache.subscribePath(`+.+.+.${sessionId}.server.spec`, (serverSpec, key) => {

      if (connected) {
        console.log('already connected, sort of', connection?.connectionState,
          connected);
        return;
      }
      const {offer, candidates, turnCredentials} = JSON.parse(serverSpec);
      console.log({offer, candidates, turnCredentials});

      connection = new RTCPeerConnection({
        iceServers: [{
          // urls: "stun:stun.l.google.com:19302"
          urls: "turn:localhost.localdomain:3478",
          username: turnCredentials.username,
          credential: turnCredentials.password,
        }],
        iceTransportPolicy: "all",
      });

      connection.onconnectionstatechange =
        event => console.log(connection.connectionState, event);

      connection.ontrack = (event) => {
        // video.current.srcObject = event.streams[0];
        video.current.srcObject = new MediaStream([event.track]);
      };

      // console.log(connection.connectionState);
      // !connected
      !connected && connection.setRemoteDescription(offer).then(() => {
          console.log('set remote', connection.connectionState);
          return Promise.all(
            candidates.map(c => connection.addIceCandidate(c)));
        }).then(() => {
          console.log('create answer', connection.connectionState);
          return connection.createAnswer();
        }).then((answer) => {
          // set bitrate:
          const kbitPerSeconds = 500;
          answer.sdp = answer.sdp.replace(/(c=.*\r\n)/,
            `$1b=AS:${kbitPerSeconds}\r\n`);
          if (connection.signalingState != 'stable') {
            return connection.setLocalDescription(answer);
          }
        }).then(() => {
          connected = true;
          dataCache.updateFromArray(
            [props.id, device, 'webrtc-video', sessionId, 'client', 'spec'],
            JSON.stringify({
              answer: connection.localDescription.toJSON()
            })
          );
        }).catch((err) => {
          console.log('error in establishing connection from spec', err);
        });
    });

    return () => {
      console.log('disconnecting');
      connection.close();
    };
  };


  useEffect(() => {
      if (!ready) {
        return;
      }

      return startVideo();
    }, [ready]);


  return <div>
    <video ref={video} autoPlay muted/>
    <div>
      <Button onClick={() => video.current.pause()}>
        stop
      </Button>
      {<Timer duration={20}
          onTimeout={() => connection.close()}
          onStart={() => startVideo()}
          />
      }
    </div>
  </div>
};

class App extends React.Component {

  webComponentDisconnected() {
    console.log('closing webrtc connection');
    connection.close();

  }

  render() {
    return <div>
      <style>
        @import url("https://maxcdn.bootstrapcdn.com/bootstrap/4.5.0/css/bootstrap.min.css");
      </style>
      <Device {...this.props}/>
    </div>;
  }
};

ReactWebComponent.create(<App />, 'webrtc-video');
