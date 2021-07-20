import React, { useState, useEffect, useMemo } from 'react';
import { DataCache, pathMatch } from '@transitive-robotics/utils/client';

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
