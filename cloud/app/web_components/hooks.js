import React, { useState, useEffect, useMemo } from 'react';
import { DataCache } from '@transitive-robotics/utils/client';

export const useWebSocket = ({jwt, id, onMessage}) => {
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
      const URL = `${TR_SECURE ? 'wss' : 'ws'}://data.${TR_HOST}?t=${jwt}&id=${id}`;
      // Note: TR_* variables are injected by webpack
      // TODO: also allow construction without token, i.e., delay connecting to ws
      // console.log('connecting to websocket server', URL)

      const ws = new WebSocket(URL);
      ws.onopen = (event) => {
        ws.send("Hi from client");
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
    status,
    ready: status == 'connected',
    StatusComponent: () => <div>{
        status == 'error' ? 'Unable to connect, are you logged in?'
        : (status == 'connecting' ? 'connecting..' : 'connected')
      }</div>
  };
};


/** connect to server via useWebSocket, collect data updates into DataCache */
export const useDataSync = ({jwt, id}) => {

  const [data, setData] = useState({});
  const dataCache = useMemo(() => new DataCache(), [jwt, id]);

  const { status, ready, StatusComponent } = useWebSocket({ jwt, id,
    onMessage: (data) => {
      window.tr_devmode && console.log('useDataSync', data);
      const newData = JSON.parse(data);
      dataCache.updateFromModifier(newData);
      setData(JSON.parse(JSON.stringify(dataCache.get())));
    }
  });

  return { status, ready, StatusComponent, data };
};
