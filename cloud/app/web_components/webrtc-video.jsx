import React, { useState, useEffect, useRef } from 'react';
import ReactWebComponent from 'react-web-component';

import { Form, Dropdown, DropdownButton, Button } from 'react-bootstrap';

import { useDataSync } from './hooks.js';
import { InlineCode } from './shared.jsx';

const styles = {
};

const decodeJWT = (jwt) => JSON.parse(atob(jwt.split('.')[1]));

let channel;
const Device = (props) => {

  const { status, ready, StatusComponent, data, dataCache }
    = useDataSync({ jwt: props.jwt, id: props.id,
      publishPath: '+.+.+.connection' });
  const {device} = decodeJWT(props.jwt);
  const video = useRef(null);

  useEffect(() => {
      const connection = new RTCPeerConnection({
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

      channel = connection.createDataChannel("sendChannel", {
        ordered: false,
        maxRetransmits: 0,
      });

      // channel.onopen = handleSendChannelStatusChange;
      // channel.onclose = handleSendChannelStatusChange;
      // channel.onmessage = handleReceiveMessage;

      connection.onconnectionstatechange =
        event => console.log(connection.connectionState, event);

      connection.addTransceiver('video');
      connection.getTransceivers().forEach(t => t.direction = 'recvonly');
      // connection.createOffer({offerToReceiveVideo: true}).then((description) => {
      connection.createOffer().then((description) => {
        console.log({description});
        return connection.setLocalDescription(description);
      });

      connection.addEventListener("icecandidate", (event) => {
        if (event.candidate) {
          const c = event.candidate.toJSON();
          console.log('candidate', c, event);
          dataCache.updateFromArray(
            [props.id, device, 'webrtc-video', 'connection'],
            JSON.stringify({
              icecandidate: c,
              offer: connection.localDescription.toJSON()
            }));
        }
      });

      connection.onnegotiationneeded = (event) => {
        console.log('negotiation needed', event);
      };

      // this is never called, why not?
      connection.ontrack = (event) => {
        console.log('received track', event);
        document.getElementById("received_video").srcObject = event.streams[0];
      };

      connection.onconnectionstatechange = event => {
        console.log(connection.connectionState);

        const remoteStream = new MediaStream(
          connection.getReceivers().map(receiver => receiver.track));
        console.log(connection.getTransceivers());
        console.log('adding stream', remoteStream, 'to', video.current);
        video.current.srcObject = remoteStream;
      };


      let connected = false;
      dataCache.subscribePath('+.+.+.serverLocalDescription', (answerString) => {
        if (!connected) {
          // to avoid "Failed to set remote answer sdp: Called in wrong state: stable"
          const answer = JSON.parse(answerString);
          console.log('got server answer', answer);
          connection.setRemoteDescription(answer);
          connected = true;
        }
      });

    }, []);

  // note: props must include jwt and id
  window.tr_devmode && console.log('webrtc-video');

  return <div>
    webrtc-video
    <button onClick={() => {
      console.log('click');
      channel && channel.send('hello from client!');
    }}>test</button>
    <video ref={video} autoPlay />
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
