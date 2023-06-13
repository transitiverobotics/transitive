import React, { useState, useEffect, useContext } from 'react';
import { Card, Button, Form } from 'react-bootstrap';

import { loglevel, getLogger, fetchJson, parseCookie }
from '@transitive-sdk/utils-web';

const { COOKIE_NAME } = require('../common.js');

const log = getLogger('Login');
log.setLevel('debug');
window.loglevel = loglevel;

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(21deg, rgb(0, 0, 0), #000, #112, #234)',
  },
  wrapper: {
    margin: 'auto',
    top: 'calc(50vh - 20em)',
    // left: 'calc(50vw - 15em)',
    padding: '2em',
    maxWidth: '30em',
    // height: '30em',
    // width: '30em'
    // marginTop: 'calc(50vh - 15em)'
  },
  loggedIn: {
    margin: 'auto'
  },
  error: {
    padding: '0.5em',
    color: '#b00',
  },
  conditions: {
    fontSize: 'smaller',
    color: '#444',
    marginTop: '2em',
    marginBottom: '2em'
  }
};

export const UserContext = React.createContext({});
export const UserContextProvider = ({children}) => {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState();
  const [error, setError] = useState();
  const refresh = () => {
    log.debug('parsing cookie');
    const cookie = parseCookie(document.cookie);
    log.debug('cookie', cookie);
    cookie[COOKIE_NAME] &&
      setSession(JSON.parse(cookie[COOKIE_NAME]));
    setReady(true);
  };
  useEffect(refresh, []);

  /** execute the login */
  const login = (user, password) =>
    fetchJson(`/@transitive-robotics/_robot-agent/login`,
      (err, res) => {
        if (err) {
          console.error(err);
          setError('Failed to log in, please check your credentials.');
        } else {
          setError(null);
          console.log('logged in');
          refresh();
        }
      },
      {body: {name: user, password}});

  const logout = () => fetchJson('/@transitive-robotics/_robot-agent/logout',
    (err, res) => {
      if (err) {
        console.error(err);
      } else {
        refresh();
        console.log('logged out');
        location.href = '/';
      }
    },
    {method: 'post'});

  return <UserContext.Provider value={{ready, session, login, logout, error}}>
    {children}
  </UserContext.Provider>;
};


/** Login component; updates the context on login/logout events */
export const Login = ({}) => {

  const url = new URL(window.location);
  url.hostname = url.hostname.split('.').slice(-2).join('.');
  url.pathname = '/';
  const homepage = url.toString();

  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const {session, login, logout, error} = useContext(UserContext);

  session && setTimeout(() => location.href = '/', 500);

  const form = <Card.Body>
    <Card.Title>Login</Card.Title>
    <Form action="#" onSubmit={(e) => {
      e.stopPropagation();
      e.preventDefault();
      login(userName, password);
    }}>
      <Form.Group className="mb-3" controlId="formBasicEmail">
        <Form.Label>Username</Form.Label>
        <Form.Control type="text" placeholder="Enter username"
          value={userName} onChange={e => setUserName(e.target.value)}
          autoComplete="username"/>
      </Form.Group>

      <Form.Group className="mb-3" controlId="formBasicPassword">
        <Form.Label>Password</Form.Label>
        <Form.Control type="password" placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"/>
      </Form.Group>

      <div style={styles.conditions}>
        By clicking the Log in button, you agree to Transitive Robotics's <a
          href={`${homepage}terms`}>Terms of Service</a> and <a
          href={`${homepage}privacy.html`}>
          Privacy Policy</a>.
      </div>

      <Button variant="primary" disabled={!userName || !password}
        onClick={() => login(userName, password)}
        type='submit'
      >
        Log in
      </Button>
      {error && <div style={styles.error}>{error}</div>}
    </Form>
  </Card.Body>;

  return <div style={styles.page}>
    <Card style={styles.wrapper}>
      <Card.Img variant="top" src="/logo_text.svg" />
      {session ?
        <div style={styles.loggedIn}>Logging in as {session.user}...</div> :
        form }
    </Card>
  </div>;
};
