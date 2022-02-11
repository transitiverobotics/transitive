import React, { useState, useEffect, useContext } from 'react';
import { Button, Form } from 'react-bootstrap';

import { createWebComponent } from '@transitive-robotics/utils-web';
import { log, getLogger, fetchJson, parseCookie }
from '@transitive-robotics/utils/client';
log.setLevel('debug');
window.log = log;


export const UserContext = React.createContext({});
export const UserContextProvider = ({children}) => {
  const [user, setUser] = useState();
  const refresh = () => {
    console.log('parsing cookie');
    const cookie = parseCookie(document.cookie);
    setUser(cookie['transitive-user']);
  };
  useEffect(refresh, []);

  return <UserContext.Provider value={{user, refresh}}>
    {children}
  </UserContext.Provider>;
};


/** Login component; updates the context on login/logout events */
export const Login = (props) => {

  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const {user, refresh} = useContext(UserContext);

  /** execute the login */
  const login = () => fetchJson(
    `${props.host || ''}/@transitive-robotics/_robot-agent/login`,
    (err, res) => {
      if (err) {
        console.error(err);
      } else {
        console.log('logged in');
        refresh();
        props.redirect && (window.location.href = props.redirect);
      }
    },
    {body: {name: userName, password}});

  const logout = () => fetchJson(
    `${props.host || ''}/@transitive-robotics/_robot-agent/logout`,
    (err, res) => {
      if (err) {
        console.error(err);
      } else {
        refresh();
        console.log('logged out');
      }
    },
    {method: 'post'});

  if (user) {
    return <div>logged in!
      <Button variant="primary" disabled={!user} onClick={logout}>
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
        onClick={login}
      >
        Log in
      </Button>
    </Form>
  </div>;
};
