import React, { useState, useEffect, useContext } from 'react';

import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useParams,
} from "react-router-dom";

import {getLogger, fetchJson} from '@transitive-robotics/utils/client';

import {Login, UserContext, UserContextProvider} from './Login.jsx';
import {Sidebar} from './Sidebar.jsx';
import { scheme1, grays } from './utils/colors';
import { ensureWebComponentIsLoaded } from './utils/utils';

const log = getLogger('App.jsx');

const styles = {
  wrapper: {
    width: '100%',
    height: '100%',
    margin: '0px',
    display: 'flex'
  },
  sidebar: {
    margin: '0',
    padding: '1em 0 0 1em',
    flex: '1 0 10rem',
    background: 'linear-gradient(45deg, #111, #333)',
    color: '#fff',
    borderRight: `1px solid ${grays[12]}`,
    position: 'relative',
    height: '100vh',
    fontSize: 'small',
    paddingBottom: '2em',
  },
  body: {
    margin: '0',
    flex: '10 1 20em',
    padding: '2em',
  },
};

/** Note, this only works on the cloud app directly when we are logged in with
    username/password, which allows us to get JWTs. This is not a model of
  how to do this with capabilities in other web applications */
const Capability = ({webComponent, capability, ...props}) => {
  const {user} = useContext(UserContext);
  const [jwtToken, setJwtToken] = useState();
  const {deviceId = '_fleet'} = useParams();

  log.debug('Capability', {deviceId, webComponent, capability, props});
  ensureWebComponentIsLoaded(capability, webComponent, user, deviceId);

  useEffect(() => {
      if (user && !jwtToken) {
        fetchJson('/@transitive-robotics/_robot-agent/getJWT',
          (err, res) => {
            if (err) {
              console.error(err);
            } else {
              setJwtToken(res.token);
            }
          },
          {body: {
            id: user,
            device: deviceId,
            capability,
            validity: 3600,
          }})
      }
    }, [user, jwtToken]);

  if (!user) {
    return <div>Log in to see device details</div>;
  }

  if (!jwtToken) {
    return <div>Authenicating...</div>;
  }

  return React.createElement(webComponent,
    {jwt: jwtToken, id: user, ...props},
    null);
};


/** Component to render widgets of capabilities, indicated in URL params.
  type = device | fleet
*/
const CapabilityWidget = ({type}) => {
  const {deviceId, scope, capabilityName} = useParams();
  const capability = `${scope}/${capabilityName}`;
  const webComponent = `${capabilityName}-${type}`;

  return <div>
    <h4>{capability}</h4>
    <Capability webComponent={webComponent} capability={capability}/>
  </div>;
};


const Apps = () => {

  return <div style={styles.wrapper}>
    <Router>
      <div style={styles.sidebar}>
        <Sidebar />
      </div>

      <div style={styles.body}>

        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/admin" />
          <Route path="/security" />

          <Route path="/" element={
              <Capability webComponent='robot-agent-fleet'
                capability='@transitive-robotics/_robot-agent'
                device_url='/device'
                />
            }/>

          <Route path="/device/:deviceId" element={
              <Capability webComponent='robot-agent-device'
                capability='@transitive-robotics/_robot-agent'
                cloud_host={`${location.protocol}//${location.host}`}
                />
            }/>

          {/** per capability and per device page */}
          <Route path="/device/:deviceId/:scope/:capabilityName"
            element={<CapabilityWidget type='device'/>} />

          <Route path="/fleet/:scope/:capabilityName"
            element={<CapabilityWidget type='fleet'/>} />

        </Routes>
      </div>
    </Router>
  </div>;

  // <health-monitoring-device id='abc' jwt='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNmcml0eiIsImNhcGFiaWxpdHkiOiJfcm9ib3QtYWdlbnQiLCJpYXQiOjE2NDM4NTY5MDN9.R0kzAK2KwCrx7v2KpNrDcNPq6KjmNyK6ufTDWusYyis'/>
};


export default () => {
  return <div>
    <UserContextProvider>
      <Apps />
    </UserContextProvider>
  </div>;
};

// <robot-agent-device
//   id="qEmYn5tibovKgGvSm"
//   cloud_host=""
//   jwt="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkZXZpY2UiOiJHYkdhMnlncXF6IiwiY2FwYWJpbGl0eSI6IkB0cmFuc2l0aXZlLXJvYm90aWNzL19yb2JvdC1hZ2VudCIsInVzZXJJZCI6InBvcnRhbFVzZXItcUVtWW41dGlib3ZLZ0d2U20iLCJ2YWxpZGl0eSI6NDMyMDAsImlhdCI6MTY0Mzg1MDQ4Nn0.ofIzMkJOsuYHPCPkJs4wqtxqjSuZk7XAh7mHZbywFeo"
//   />


// eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkZXZpY2UiOiJHYkdhMnlncXF6IiwiY2FwYWJpbGl0eSI6IkB0cmFuc2l0aXZlLXJvYm90aWNzL19yb2JvdC1hZ2VudCIsInVzZXJJZCI6InBvcnRhbFVzZXItcUVtWW41dGlib3ZLZ0d2U20iLCJ2YWxpZGl0eSI6NDMyMDAsImlhdCI6MTY0Mzg1MDQ4Nn0.ofIzMkJOsuYHPCPkJs4wqtxqjSuZk7XAh7mHZbywFeo"
// jwt="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNmcml0eiIsImNhcGFiaWxpdHkiOiJfcm9ib3QtYWdlbnQiLCJpYXQiOjE2NDM4NTY5MDN9.R0kzAK2KwCrx7v2KpNrDcNPq6KjmNyK6ufTDWusYyis"
