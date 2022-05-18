import React, { useState, useEffect, useContext } from 'react';

import {useParams} from "react-router-dom";

import { Form, Button } from 'react-bootstrap';

import {getLogger, fetchJson} from '@transitive-sdk/utils-web';
const log = getLogger('StandAloneComponent');

import { ensureWebComponentIsLoaded } from './utils/utils';

const styles = {
  passwordForm: {
    margin: 'auto',
    height: '10em',
    marginTop: 'calc(50vh - 5em)',
    maxWidth: '20em',
  },
  wrapper: {
    padding: '1em'
  }
};

/** to serve stand-alone pages for capability widgets */
export const StandAloneComponent = (props = {}) => {

  const params = useParams();
  const {org, device, scope, capName, widget} = params;
  const query = new URLSearchParams(location.search);
  const token = query.get('token');

  const [jwtToken, setJwtToken] = useState();
  const [error, setError] = useState();

  log.debug('StandAloneComponent', params);
  const capability = `${scope}/${capName}`;
  ensureWebComponentIsLoaded(capability, widget, org, device);

  const [password, setPassword] = useState();

  const getJWT = () => {
    // Trades our token for a JWT with the permissions that were granted to
    // this token when it was created
    fetchJson('/getJWTFromToken',
      (err, res) => {
        if (err) {
          console.error(err);
          setError(err);
        } else {
          setJwtToken(res.token);
        }
      },
      {body: {token, org, password}});
  };

  if (error) {
    return <div>Not authorized.</div>;
    // TODO: return from fetchJson better errors, incl. status code, then use
    // them here to distinguish.
  }

  if (!jwtToken) {
    return <div style={styles.passwordForm}>
      <Form.Group className="mb-3" controlId="formBasicPassword">
        <Form.Label>Enter password for <tt>{token}</tt></Form.Label>
        <Form.Control type="password" placeholder="Password"
          onChange={(e) => setPassword(e.target.value)}
          value={password}
          />
        <Button variant="primary" type="submit" onClick={getJWT}>
          Submit
        </Button>
      </Form.Group>
    </div>;
  }

  const ssl = (location.protocol == 'https:');

  const element = React.createElement(widget, {
      jwt: jwtToken,
      id: org,
      host: TR_HOST,
      ssl,
      ...props
    }, null);

  return <div style={styles.wrapper}>{element}</div>;
};
