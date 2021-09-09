import React, { useState, useEffect, useMemo } from 'react';
import { DataCache, pathMatch } from '@transitive-robotics/utils/client';

/** This is used to connect to the Transitive cloud and authenticate
  using the provided jwt token. */
export const useWebSocket = ({jwt, id, onMessage}) => {
  const [status, setStatus] = useState('connecting');
  const [ws, setWS] = useState();

  useEffect(() => {
      const URL = `${TR_SECURE ? 'wss' : 'ws'}://data.${TR_HOST}?t=${jwt}&id=${id}`;
      // Note: TR_* variables are injected by webpack
      // TODO: also allow construction without token, i.e., delay connecting to ws
      // console.log('connecting to websocket server', URL)

      const ws = new WebSocket(URL);
      ws.onopen = (event) => {
        // ws.send("Hi from client");
        setWS(ws);
        setStatus('connected');
      };

      ws.onmessage = (event) => onMessage && onMessage(event.data);
      ws.onerror = (event) => {
        setStatus('error');
        console.error('websocket error', event);
      };
      ws.onclose = (event) => {
        setStatus('closed');
        console.log('websocket closed', event);
      };
    }, [jwt, id]);

  return {
    ws,
    status,
    ready: status == 'connected',
    StatusComponent: () => <div>{
        status == 'error' ? 'Unable to connect, are you logged in?'
        : (status == 'connecting' ? 'connecting..' : 'connected')
      }</div>
  };
};


/** connect to server via useWebSocket, collect data updates into DataCache */
export const useDataSync = ({jwt, id, publishPath}) => {
    const [data, setData] = useState({});
  const dataCache = useMemo(() => new DataCache(), [jwt, id]);

  const { ws, status, ready, StatusComponent } = useWebSocket({ jwt, id,
    onMessage: (data) => {
      const newData = JSON.parse(data);
      window.tr_devmode && console.log('useDataSync', newData);
      // do not update paths we publish ourselves, to avoid loops:
      publishPath && Object.keys(newData).forEach(key => {
        const keyPath = key.replace(/\//g, '.').slice(1);
        if (pathMatch(publishPath, keyPath)) {
          delete newData[key]
        }
      });
      window.tr_devmode && console.log('useDataSync, filtered keys', newData);
      dataCache.updateFromModifier(newData);
      setData(JSON.parse(JSON.stringify(dataCache.get())));
    }
  });

  publishPath && useEffect(() => {
      ws && dataCache.subscribePath(publishPath,
        (value, key, matched) => {
          const changes = {};
          changes[key] = value;
          console.log('sending data update to server', changes);
          ws.send(JSON.stringify(changes));
        })
    }, [ws]);
  return { status, ready, StatusComponent, data, dataCache };
};

/** Uses the provided dataCache as signaling channel to the device to
  request and establish a webrtc connection to the named capability.
  It is the capability on the device (robot) that determines what kind of
  data channels and tracks to create on the connection.
*/
export const useWebRTC = ({sessionId, ready, dataCache, source, id, device,
  onConnectionStateChange, onTrack, bitrate_KB, capabilityName }) => {

    let connected = false;
    let connection;

    const startVideo = () => {
      console.log('starting video for', sessionId);

      // request an audience (webrtc connection) with the device
      dataCache.updateFromArray(
        [id, device, capabilityName, sessionId, 'client', 'request'],
        source
      );

      dataCache.subscribePath(`+.+.+.${sessionId}.server.spec`, (serverSpec, key) => {

        if (connected) {
          // console.log('already connected, sort of', connection?.connectionState,
          //   connected);
          return;
        }
        const {offer, turnCredentials} = JSON.parse(serverSpec);
        console.log({offer, turnCredentials});

        connection = new RTCPeerConnection({
          iceServers: [{
            // urls: "stun:stun.l.google.com:19302"
            // urls: "turn:localhost.localdomain:3478",
            urls: `turn:${TR_HOST.split(':')[0]}:3478`,
            username: turnCredentials.username,
            credential: turnCredentials.password,
          }],
          iceTransportPolicy: "all",
        });

        connection.onicecandidate = (event) => {
          // console.log('icecandidate', event.candidate && event.candidate.type,
          //   event.candidate);

          // if (event.candidate && event.candidate.type != 'relay') return; // #DEBUG

          event.candidate && dataCache.updateFromArray(
            [id, device, capabilityName, sessionId, 'client', 'spec'],
            {
              candidate: JSON.stringify(event.candidate)
            }
          );
        };

        connection.onicecandidateerror = (event) => {
          console.log('onicecandidateerror', event);
        };

        connection.onconnectionstatechange =
          event => onConnectionStateChange
            && onConnectionStateChange(connection.connectionState);

        connection.ontrack = (event) => onTrack && onTrack(event.track);

        // console.log(connection.connectionState);
        // !connected
        !connected && connection.setRemoteDescription(offer).then(() => {
            // console.log('set remote', connection.connectionState);
            //   return Promise.all(
            //     candidates.map(c => connection.addIceCandidate(c)));
            // }).then(() => {
            // console.log('create answer', connection.connectionState);
            return connection.createAnswer();
          }).then((answer) => {
            // set bitrate:
            const kbitPerSeconds = bitrate_KB || 500;
            answer.sdp = answer.sdp.replace(/(c=.*\r\n)/,
              `$1b=AS:${kbitPerSeconds}\r\n`);
            if (connection.signalingState != 'stable') {
              return connection.setLocalDescription(answer);
            }
          }).then(() => {
            connected = true;
            dataCache.updateFromArray(
              [id, device, capabilityName, sessionId, 'client', 'spec'], {
                answer: JSON.stringify(connection.localDescription.toJSON())
              });
          }).catch((err) => {
            console.log('warning when establishing connection from spec:', err);
          });
      });

      dataCache.subscribePath(`+.+.+.${sessionId}.server.candidate`, (candidate, key) => {
        // console.log('got candidate from server', JSON.parse(candidate));
        connection && connection.addIceCandidate(JSON.parse(candidate));
      });

      return () => {
        console.log('disconnecting video', sessionId);
        connection && connection.close();
      };
    };

    useEffect(() => ready && startVideo(), [ready, source]);
  };
