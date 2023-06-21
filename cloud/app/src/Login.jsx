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
          log.error(err);
          setError('Failed to log in, please check your credentials.');
        } else {
          setError(null);
          log.debug('logged in');
          refresh();
        }
      },
      {body: {name: user, password}});

  const logout = () => fetchJson('/@transitive-robotics/_robot-agent/logout',
    (err, res) => {
      if (err) {
        log.error(err);
      } else {
        refresh();
        log.debug('logged out');
        location.href = '/';
      }
    },
    {method: 'post'});

  /** register new account */
  const register = (user, password, email) =>
    fetchJson(`/@transitive-robotics/_robot-agent/register`,
      (err, res) => {
        if (err) {
          log.error(err, res);
          setError(`Failed to register: ${res.error}`);
        } else {
          setError(null);
          log.debug('registered');
          refresh();
        }
      },
      {body: {name: user, password, email}});

  return <UserContext.Provider
    value={{ready, session, login, logout, register, error}}>
    {children}
  </UserContext.Provider>;
};

/** A link (anchor) that can be used as a button */
const ActionLink = ({onClick, children}) =>
  <a href='#' onClick={(e) => {
    e.preventDefault();
    onClick();
    return false;
  }}>{children}</a>;


/** Login component; updates the context on login/logout events */
export const Login = ({mode = undefined}) => {

  const url = new URL(window.location);
  url.hostname = url.hostname.split('.').slice(-2).join('.');
  url.pathname = '/';
  const homepage = url.toString();

  const [isRegister, setIsRegister] = useState(mode == 'register');
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const {session, login, logout, register, error} = useContext(UserContext);

  session && setTimeout(() => location.href = '/', 500);
  const action = (isRegister ? 'Register' : 'Log in');

  const submit = () => isRegister
    ? register(userName, password, email)
    : login(userName, password);

  const form = isRegister && !TR_REGISTRATION_ENABLED
    ? <div>Sorry, registration is disabled.</div>
    : <Card.Body>
      <Card.Title>
        {action}
      </Card.Title>

      <Form noValidate onSubmit={(e) => {
        e.stopPropagation();
        e.preventDefault();
        submit();
      }}>
        <Form.Group className='mb-3' controlId='formUsername'>
          <Form.Label>Username</Form.Label>
          <Form.Control type='text'
            placeholder={isRegister ? 'Lower case, ideally short' : 'Username'}
            value={userName} onChange={e => setUserName(e.target.value.toLowerCase())}
            autoComplete='username'
            required
            isInvalid={userName.length > 0 && !userName.match(/^[a-z]+[a-z0-9]*$/)}
            />
          <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
        </Form.Group>

        {isRegister && <Form.Group className='mb-3' controlId='formBasicEmail'>
          <Form.Label>Email</Form.Label>
          <Form.Control type='email' placeholder='Email'
            value={email} onChange={e => setEmail(e.target.value)}
            required
            />
        </Form.Group>}

        <Form.Group className='mb-3' controlId='formBasicPassword'>
          <Form.Label>Password</Form.Label>
          <Form.Control type='password' placeholder='Password'
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            isInvalid={password.length > 0 && password.length < 8}
            autoComplete={isRegister ? 'new-password' : 'current-password'}/>
        </Form.Group>

        {isRegister &&
            <Form.Group className='mb-3' controlId='formBasicPassword2'>
              <Form.Label>Repeat Password</Form.Label>
              <Form.Control type='password' placeholder='Password'
                value={password2}
                onChange={e => setPassword2(e.target.value)}
                isInvalid={password2.length > 0 && password2 != password}
                autoComplete={isRegister ? 'new-password' : 'current-password'}/>
            </Form.Group>
        }

        <div style={styles.conditions}>
          By clicking the {action} button, you agree to Transitive Robotics's <a
            href={`${homepage}terms`}>Terms of Service</a> and <a
            href={`${homepage}privacy.html`}>
            Privacy Policy</a>.
        </div>

        <Button variant='primary'
          disabled={isRegister
            ? (!userName || !userName.match(/^[a-z]+[a-z0-9]*$/) || !password ||
              !password2 || (password != password2) || !email ||
              !email.match(/.@..*\.[a-zA-Z]{2}/))
            : (!userName || !password)
          }
          type='submit'
        >
          {action}
        </Button> &nbsp;<span> or {isRegister
            ? <ActionLink onClick={() => setIsRegister(false)}>
              Log in
            </ActionLink>
            : <ActionLink onClick={() => setIsRegister(true)}>
              Register
            </ActionLink>
          }
        </span>
        {error && <div style={styles.error}>{error}</div>}
      </Form>
    </Card.Body>;

  return <div style={styles.page}>
    <Card style={styles.wrapper}>
      <Card.Link href={homepage}>
        <Card.Img variant='top' src='/logo_text.svg' />
      </Card.Link>
      {session ?
        <div style={styles.loggedIn}>Logging in as {session.user}...</div> :
        form }
    </Card>
  </div>;
};
