import React, { useState, useEffect, useContext } from 'react';
import ReactWebComponent from 'react-web-component';
const _ = {
  map: require('lodash/map'),
};

import { ListGroup } from 'react-bootstrap';

// import { DataCache } from '@transitive-robotics/utils/client';
import { decodeJWT } from '@transitive-robotics/utils/client';

import { useWebSocket, useDataSync2 } from './hooks.js';
import { LevelBadge, createWebComponent } from './shared.jsx';

const STALE_THRESHOLD = 5 * 60 * 60 * 1e3;

const styles = {
  title: {
    marginRight: '0.5em',
  },
  secondary: {
    color: '#777',
    fontSize: 'smaller',
    marginLeft: '1em'
  },
  list: {
    width: '40em'
  },
  date: (date) => ({
    float: 'right',
    // mark the date in red if it's too old
    color: Date.now() - (new Date(date)) > STALE_THRESHOLD ? '#f77' : '#777',
    fontSize: 'smaller',
  }),
  hostname: {
    marginLeft: '1em'
  }
};

// const dataCache= new DataCache();
const FleetHealth = ({jwt, id, deviceurl, setOnDisconnect}) => {
  // const [data, setData] = useState({});
  // const { status, ready, StatusComponent } = useWebSocket({ jwt, id,
  //   onMessage: (data) => {
  //     window.tr_devmode && console.log(data);
  //     const newData = JSON.parse(data);
  //     dataCache.updateFromModifier(newData);
  //     const newGlobal = dataCache.get([id, '_fleet', 'health-monitoring']);
  //     newGlobal && setData(JSON.parse(JSON.stringify(newGlobal)));
  //   }
  // });

  const { status, ready, StatusComponent, data, stop } = useDataSync2({ jwt, id });
  const { device } = decodeJWT(jwt);
  setOnDisconnect(stop);

  if (!ready || !data || !data[id]) {
    return <StatusComponent />;
  }

  const ourData = data[id]._fleet['health-monitoring'];
  console.log(data, ourData);

  if (!ourData.devices || !Object.values(ourData.devices).length) {
    return <div>No devices found. Make sure you have connected devices to
      your account and installed the Health Monitoring capability.</div>
  } else {

    return <div>
      <b style={styles.title}>Fleet Health</b>
      <LevelBadge level={ourData && ourData.level}/>
      <ListGroup variant="flush" style={styles.list}>
        {_.map(ourData.devices, ({hostname, level, msgs, heartbeat}, id) =>
            <ListGroup.Item key={id}>
              <LevelBadge level={level}/> <span style={styles.hostname}>
                { deviceurl ?
                  <a href={deviceurl.replace(':deviceId', id)}>{hostname}</a>
                  : hostname }
              </span>

              <div style={styles.date(heartbeat)}>
                updated: {new Date(heartbeat).toLocaleString()}
              </div>

              <br/>
              {msgs && msgs.length > 0 && <div style={styles.secondary}>
                {msgs.map((msg, i) => <div key={i}>{msg}</div>)}
              </div>}
            </ListGroup.Item>)
        }
      </ListGroup>
    </div>;
  }
};


class App extends React.Component {

  render() {
    console.log('rendering health-monitoring-fleet', this.props);

    return <div>
      <style>
        @import url("https://maxcdn.bootstrapcdn.com/bootstrap/4.5.0/css/bootstrap.min.css");
      </style>

      <FleetHealth {...this.props}/>
    </div>;
  }
}

// ReactWebComponent.create(<App />, 'health-monitoring-fleet');
createWebComponent(App, 'health-monitoring-fleet', ['jwt']);
