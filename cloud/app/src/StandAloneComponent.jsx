import React, { useState, useEffect, useContext, useMemo } from 'react';

import {useParams} from "react-router-dom";

import { Form, Button } from 'react-bootstrap';

import {getLogger, fetchJson, parseCookie, decodeJWT} from '@transitive-sdk/utils-web';
const log = getLogger('StandAloneComponent');
log.setLevel('debug');

import { ensureWebComponentIsLoaded } from './utils/utils';
import { TOKEN_COOKIE } from '../common.js';

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

  const cookie = useMemo(() => {
      const cookie = parseCookie(document.cookie);
      log.debug('cookie', cookie);
      return cookie;
    }, []);

  const params = useParams();
  const {org, device, scope, capName, widget} = params;
  const capability = `${scope}/${capName}`;
  const query = new URLSearchParams(location.search);
  const token = query.get('token');

  const isValid = (jwtToken) => {
    if (!jwtToken) return false;

    const payload = decodeJWT(jwtToken);
    log.debug({payload});
    return (payload.iat + payload.validity > Date.now()/1e3 &&
      payload.device == device &&
      payload.id == org &&
      payload.capability == capability);
  };

  const cookieJson = cookie[TOKEN_COOKIE] ? JSON.parse(cookie[TOKEN_COOKIE]) : {};
  const validCookie = (token == cookieJson?.tokenName);
  if (!validCookie) {
    log.debug('Session cookie belongs to a different token.');
  }

  const [jwtToken, setJwtToken] = useState(validCookie &&
    cookieJson?.token && isValid(cookieJson?.token) && cookieJson.token);
  const [config, setConfig] = useState(validCookie && cookieJson?.config);
  const [error, setError] = useState();

  // log.debug('StandAloneComponent', params);
  ensureWebComponentIsLoaded(capability, widget, org, device);

  const [password, setPassword] = useState('');

  const getJWT = () => {
    // Trades our token for a JWT with the permissions that were granted to
    // this token when it was created
    fetchJson('/caps/getJWTFromToken',
      (err, res) => {
        if (err) {
          log.error(err);
          setError(err);
        } else {
          log.debug({res});
          res.config && setConfig(res.config);
          isValid(res.token) && setJwtToken(res.token);
        }
      },
      {body: {token, org, password}});
  };

  log.debug({jwtToken, config, token, cookieJson, validCookie});

  if (error) {
    return <div>Not authorized.</div>;
    // TODO: return from fetchJson better errors, incl. status code, then use
    // them here to distinguish.
  }

  if (!jwtToken) {
      return <div style={styles.passwordForm}>
      <Form onSubmit={(e) => {
        e.stopPropagation();
        e.preventDefault();
        getJWT();
      }}>
        <Form.Group className="mb-3" controlId="formBasicPassword">
          <Form.Label>Enter password for <tt>{token}</tt></Form.Label>
          <Form.Control type="password" placeholder="Password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            />
        </Form.Group>
        <Button variant="primary" type="submit" onClick={getJWT}>
          Submit
        </Button>
      </Form>
    </div>;
  }

  const ssl = (location.protocol == 'https:');

  const element = React.createElement(widget, {
      jwt: jwtToken,
      id: org,
      host: TR_HOST,
      ssl,
      ...props,
      ...config // apply pre-configured options, if set in token
    }, null);

  return <div style={styles.wrapper}>{element}</div>;
};
