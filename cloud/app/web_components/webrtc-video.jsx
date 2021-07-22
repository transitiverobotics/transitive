import React, { useState, useEffect, useRef } from 'react';
import ReactWebComponent from 'react-web-component';

import { Button } from 'react-bootstrap';

import { useDataSync } from './hooks.js';
import { InlineCode } from './shared.jsx';

const styles = {
};

const decodeJWT = (jwt) => JSON.parse(atob(jwt.split('.')[1]));

let channel;
let connection;
let connected = false;

const sessionId = Math.random().toString(36).slice(2);

const Device = (props) => {

  const { status, ready, StatusComponent, data, dataCache }
    = useDataSync({ jwt: props.jwt, id: props.id,
      publishPath: `+.+.+.${sessionId}.client` });
  const {device} = decodeJWT(props.jwt);
  const video = useRef(null);

  useEffect(() => {
      if (!ready) {
        return;
      }

      // request an audience (webrtc connection) with the device
      dataCache.updateFromArray(
        [props.id, device, 'webrtc-video', sessionId, 'client', 'request'], new Date()
      );

      dataCache.subscribePath(`+.+.+.${sessionId}.server.spec`, (serverSpec) => {
        if (connected) {
          console.log('already connected, sort of');
          return;
        }
        const {offer, candidate, turnCredentials} = JSON.parse(serverSpec);
        console.log({offer, candidate, turnCredentials});

        connection = new RTCPeerConnection({
          iceServers: [{
            // urls: "stun:stun.l.google.com:19302"
            urls: "turn:localhost.localdomain:3478",
            username: turnCredentials.username,
            credential: turnCredentials.password,
          }]
        });

        connection.onconnectionstatechange =
          event => console.log(connection.connectionState, event);

        connection.ontrack = (event) => {
          console.log('received track', event);
          // video.current.srcObject = event.streams[0];
          video.current.srcObject = new MediaStream([event.track]);
        };

        !connected && connection.setRemoteDescription(offer).then(() => {
            console.log('description set!');
            connected = true;
            return connection.addIceCandidate(candidate);
          }).then(() => {
            console.log('ice set!');
            return connection.createAnswer();
          }).then((answer) => {
            // set bitrate:
            const kbitPerSeconds = 500;
            answer.sdp = answer.sdp.replace(/(c=.*\r\n)/,
              `$1b=AS:${kbitPerSeconds}\r\n`);
            console.log({answer});
            return connection.setLocalDescription(answer);
          }).then(() => {
            console.log('sending answer to server');
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
    }, [ready]);


  return <div>
    <video ref={video} autoPlay muted/>
    <div>
      <Button onClick={() => connection.close()}>
        stop
      </Button>
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
