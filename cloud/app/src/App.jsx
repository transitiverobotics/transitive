import React, { useState, useEffect } from 'react';

import {log, getLogger, fetchJson} from '@transitive-robotics/utils/client';
import {useAccount} from '@transitive-robotics/utils-web';

export default () => {

  const {user} = useAccount();
  // #HERE: ^^ this is not shared!! so calling refresh in Login doesn't trigger
  // a reaction here; maybe use a react context after all?



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
            capability: '_robot-agent'
          }})
      }
    }, [user, jwtToken]);

  console.log({user, jwtToken});

  return <div>
    The App

    <robot-agent-login />
  </div>;
};

// <robot-agent-device
//   id="qEmYn5tibovKgGvSm"
//   cloud_host=""
//   jwt="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkZXZpY2UiOiJHYkdhMnlncXF6IiwiY2FwYWJpbGl0eSI6IkB0cmFuc2l0aXZlLXJvYm90aWNzL19yb2JvdC1hZ2VudCIsInVzZXJJZCI6InBvcnRhbFVzZXItcUVtWW41dGlib3ZLZ0d2U20iLCJ2YWxpZGl0eSI6NDMyMDAsImlhdCI6MTY0Mzg1MDQ4Nn0.ofIzMkJOsuYHPCPkJs4wqtxqjSuZk7XAh7mHZbywFeo"
//   />


// eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkZXZpY2UiOiJHYkdhMnlncXF6IiwiY2FwYWJpbGl0eSI6IkB0cmFuc2l0aXZlLXJvYm90aWNzL19yb2JvdC1hZ2VudCIsInVzZXJJZCI6InBvcnRhbFVzZXItcUVtWW41dGlib3ZLZ0d2U20iLCJ2YWxpZGl0eSI6NDMyMDAsImlhdCI6MTY0Mzg1MDQ4Nn0.ofIzMkJOsuYHPCPkJs4wqtxqjSuZk7XAh7mHZbywFeo"
// jwt="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNmcml0eiIsImNhcGFiaWxpdHkiOiJfcm9ib3QtYWdlbnQiLCJpYXQiOjE2NDM4NTY5MDN9.R0kzAK2KwCrx7v2KpNrDcNPq6KjmNyK6ufTDWusYyis"
