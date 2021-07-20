import React, { useState, useEffect, useRef } from 'react';
import ReactWebComponent from 'react-web-component';

import { Form, Dropdown, DropdownButton, Button } from 'react-bootstrap';

import { useDataSync } from './hooks.js';
import { InlineCode } from './shared.jsx';

const styles = {
};

const decodeJWT = (jwt) => JSON.parse(atob(jwt.split('.')[1]));

let channel;
let connection;
let connected = false;

const Device = (props) => {

  const { status, ready, StatusComponent, data, dataCache }
    = useDataSync({ jwt: props.jwt, id: props.id,
      publishPath: '+.+.+.clientSpec' });
  const {device} = decodeJWT(props.jwt);
  const video = useRef(null);

  useEffect(() => {
      // const sessionId = Math.random().toString(36).slice(2);
      //
      // // request an audience (webrtc connection) with the device
      // dataCache.updateFromArray(
      //   [props.id, device, 'webrtc-video', 'clientSpec'],
      //   JSON.stringify({
      //     answer: connection.localDescription.toJSON()
      //   })
      // );

      dataCache.subscribePath('+.+.+.serverSpec', (serverSpec) => {
        if (connected) {
          console.log('already connected, sort of');
          return;
        }
        const {offer, candidate} = JSON.parse(serverSpec);
        console.log({offer, candidate});

        connection = new RTCPeerConnection({
          // Account needed: http://numb.viagenie.ca/
          iceServers: [
            {
              // urls: "stun:numb.viagenie.ca:3478",
              urls: "stun:stun.l.google.com:19302"
            },
            // {
            //   urls: "turn:numb.viagenie.ca:3478",
            //   username: TURN_USERNAME,
            //   credential: TURN_CREDENTIAL,
            // }
          ]
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
              [props.id, device, 'webrtc-video', 'clientSpec'],
              JSON.stringify({
                answer: connection.localDescription.toJSON()
              })
            );
          }).catch((err) => {
            console.log('error in establishing connection from spec', err);
          });
      });
    }, []);

  // note: props must include jwt and id
  window.tr_devmode && console.log('webrtc-video');

  return <div>
    webrtc-video
    <button onClick={() => {
      console.log('does nothing right now');
      // channel && channel.send('hello from client!');
      // console.log(connection.getTransceivers());
      // video.current.play();
    }}>test</button>
    <video ref={video} autoPlay muted/>
  </div>
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

ReactWebComponent.create(<App />, 'webrtc-video');
