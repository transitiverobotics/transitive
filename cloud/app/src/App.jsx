import React, { useState, useEffect, useContext } from 'react';

import {log, getLogger, fetchJson} from '@transitive-robotics/utils/client';

import {Login, UserContext, UserContextProvider} from './Login.jsx';

const Apps = () => {
  const {user} = useContext(UserContext);
  const [jwtToken, setJwtToken] = useState();

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
            device: 'GbGa2ygqqz',
            capability: '@transitive-robotics/_robot-agent',
            validity: 3600,
          }})
      }
    }, [user, jwtToken]);

  console.log({user, jwtToken});

  if (!user) {
    return <div>Log in to see device details</div>;
  }

  if (!jwtToken) {
    return <div>Authenicating...</div>;
  }

  return <robot-agent-device id={user} jwt={jwtToken}
    cloud_host={`${location.protocol}//${location.host}`} />;

  // <health-monitoring-device id='abc' jwt='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNmcml0eiIsImNhcGFiaWxpdHkiOiJfcm9ib3QtYWdlbnQiLCJpYXQiOjE2NDM4NTY5MDN9.R0kzAK2KwCrx7v2KpNrDcNPq6KjmNyK6ufTDWusYyis'/>
};


export default () => {
  return <div>
    The App

    <UserContextProvider>
      <Login />
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
