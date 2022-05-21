import React, { useState, useEffect, useContext } from 'react';
import { Button, Form } from 'react-bootstrap';

import { loglevel, getLogger, fetchJson, parseCookie }
from '@transitive-sdk/utils-web';

const { COOKIE_NAME } = require('../common.js');

loglevel.setLevel('debug');
window.loglevel = loglevel;
const log = getLogger('Login');

export const UserContext = React.createContext({});
export const UserContextProvider = ({children}) => {
  const [session, setSession] = useState();
  const refresh = () => {
    log.debug('parsing cookie');
    const cookie = parseCookie(document.cookie);
    log.debug('cookie', cookie);
    cookie[COOKIE_NAME] &&
      setSession(JSON.parse(cookie[COOKIE_NAME]));
  };
  useEffect(refresh, []);

  /** execute the login */
  const login = (user, password, redirect = undefined) =>
    fetchJson(`/@transitive-robotics/_robot-agent/login`,
      (err, res) => {
        if (err) {
          console.error(err);
        } else {
          console.log('logged in');
          refresh();
          props.redirect && (window.location.href = props.redirect);
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
        window.location.href = '/';
      }
    },
    {method: 'post'});

  return <UserContext.Provider value={{session, login, logout}}>
    {children}
  </UserContext.Provider>;
};


/** Login component; updates the context on login/logout events */
export const Login = ({redirect}) => {

  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const {session, login, logout} = useContext(UserContext);

  if (session) {
    return <div>
      You are logged in as {session.user}.
      <Button variant="primary" onClick={logout}>
        Log out
      </Button>
    </div>;
  }

  return <div>
    Login
    <Form>
      <Form.Group controlId="formBasicEmail">
        <Form.Label>Username</Form.Label>
        <Form.Control type="text" placeholder="Enter username"
          value={userName} onChange={e => setUserName(e.target.value)}
          autoComplete="username"/>
      </Form.Group>

      <Form.Group controlId="formBasicPassword">
        <Form.Label>Password</Form.Label>
        <Form.Control type="password" placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"/>
      </Form.Group>
      <Button variant="primary" disabled={!userName || !password}
        onClick={() => login(userName, password, redirect)}
      >
        Log in
      </Button>
    </Form>
  </div>;
};
